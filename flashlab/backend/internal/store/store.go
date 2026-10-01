// Package store persists FLASHLAB daemon state (admins, counters) with an
// atomic write + /tmp vault mirror (the scrub-proof pattern).
package store

import (
        "encoding/json"
        "os"
        "path/filepath"
        "sync"
)

// State is the durable daemon state.
type State struct {
        Admins       []int64 `json:"admins"`
        StartedAt    int64   `json:"started_at"`
        CmdCount     int64   `json:"cmd_count"`
        KeysCreated  int64   `json:"keys_created"`
        LastReportTS int64   `json:"last_report_ts"`
}

// Store is a concurrency-safe state file.
type Store struct {
        mu   sync.Mutex
        path string
        st   State
}

const tmpMirror = "/tmp/my-project/flashlab-state.json"

// mirrorEnabled — ONLY the production state file mirrors to /tmp. Unit tests
// open temp-dir stores; without this guard their writes pollute the mirror
// and a later daemon boot would restore fake test admins (the P182 bug:
// admins [13,42] + cmd_count 8 appeared on a fresh daemon).
func mirrorEnabled(path string) bool {
        return path == "/home/z/my-project/flashlab/backend-state.json"
}

// Open loads (or creates) the state file.
func Open(path string) *Store {
        s := &Store{path: path}
        // restore from /tmp if the project copy was scrubbed
        if _, err := os.Stat(path); err != nil && mirrorEnabled(path) {
                if b, e := os.ReadFile(tmpMirror); e == nil {
                        _ = os.MkdirAll(filepath.Dir(path), 0o700)
                        _ = os.WriteFile(path, b, 0o600)
                }
        }
        b, err := os.ReadFile(path)
        if err == nil {
                _ = json.Unmarshal(b, &s.st)
        }
        if s.st.StartedAt == 0 {
                s.st.StartedAt = 0
        }
        return s
}

// Get snapshots the state.
func (s *Store) Get() State {
        s.mu.Lock()
        defer s.mu.Unlock()
        return s.st
}

// Update mutates the state under lock and persists atomically.
func (s *Store) Update(fn func(*State)) {
        s.mu.Lock()
        defer s.mu.Unlock()
        fn(&s.st)
        b, _ := json.MarshalIndent(s.st, "", " ")
        tmp := s.path + ".tmp"
        if err := os.WriteFile(tmp, b, 0o600); err == nil {
                _ = os.Rename(tmp, s.path)
        }
        if mirrorEnabled(s.path) {
                _ = os.MkdirAll(filepath.Dir(tmpMirror), 0o700)
                _ = os.WriteFile(tmpMirror, b, 0o600)
        }
}

// IsAdmin checks the admin list.
func (s *Store) IsAdmin(id int64) bool {
        s.mu.Lock()
        defer s.mu.Unlock()
        for _, a := range s.st.Admins {
                if a == id {
                        return true
                }
        }
        return false
}

// AddAdmin claims an admin (first one wins the ownership, more can follow).
func (s *Store) AddAdmin(id int64) bool {
        s.mu.Lock()
        defer s.mu.Unlock()
        for _, a := range s.st.Admins {
                if a == id {
                        return false
                }
        }
        s.st.Admins = append(s.st.Admins, id)
        b, _ := json.MarshalIndent(s.st, "", " ")
        _ = os.WriteFile(s.path, b, 0o600)
        if mirrorEnabled(s.path) {
                _ = os.WriteFile(tmpMirror, b, 0o600)
        }
        return true
}

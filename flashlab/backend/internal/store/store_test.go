// Package store tests — persistence + admin claim.
package store

import (
        "os"
        "path/filepath"
        "testing"
)

func TestAdminClaim(t *testing.T) {
        s := Open(filepath.Join(t.TempDir(), "st.json"))
        if s.IsAdmin(7) {
                t.Fatal("7 must not be admin yet")
        }
        if !s.AddAdmin(7) {
                t.Fatal("first claim must succeed")
        }
        if s.AddAdmin(7) {
                t.Fatal("double claim must be rejected")
        }
        if !s.IsAdmin(7) {
                t.Fatal("7 must be admin now")
        }
}

func TestPersistAcrossOpen(t *testing.T) {
        p := filepath.Join(t.TempDir(), "st.json")
        s := Open(p)
        s.AddAdmin(11)
        s.Update(func(x *State) { x.CmdCount = 42; x.KeysCreated = 3 })
        s2 := Open(p)
        g := s2.Get()
        if !s2.IsAdmin(11) || g.CmdCount != 42 || g.KeysCreated != 3 {
                t.Fatalf("state lost: %+v admin=%v", g, s2.IsAdmin(11))
        }
}

func TestTmpMirrorWritten(t *testing.T) {
        // production path mirrors to /tmp (scrub-proof pattern)…
        if _, err := os.Stat("/home/z/my-project/flashlab"); err != nil {
                t.Skip("no project dir in this environment:", err)
        }
        prod := "/home/z/my-project/flashlab/backend-state.json"
        _ = os.Remove(tmpMirror)
        s := Open(prod)
        s.Update(func(x *State) { x.CmdCount = 1 })
        if _, err := os.Stat(tmpMirror); err != nil {
                t.Fatalf("production store must mirror: %v", err)
        }
        _ = os.Remove(prod)
        _ = os.Remove(tmpMirror)

        // …but temp-dir stores (unit tests) must NEVER touch the mirror —
        // the P182 bug: test admins [13,42] leaked into a fresh daemon via /tmp.
        _ = os.Remove(tmpMirror)
        s2 := Open(filepath.Join(t.TempDir(), "st.json"))
        s2.AddAdmin(13)
        s2.Update(func(x *State) { x.CmdCount = 42 })
        if _, err := os.Stat(tmpMirror); err == nil {
                t.Fatal("temp store polluted the /tmp mirror")
        }
}

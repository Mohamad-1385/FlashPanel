// Package bot tests — bridge flow with a fake D1 (in-memory rows).
package bot

import (
	"strings"
	"sync"
	"testing"

	"volt/internal/config"
	"volt/internal/panel"
	"volt/internal/store"
	"volt/internal/telegram"
)

// fakeD1 is an in-memory D1 for the bridge tests (clean seam — no network).
type fakeD1 struct {
	mu       sync.Mutex
	inbox    []map[string]any
	outbox   []map[string]any
	inboxSeq int64
	outSeq   int64
}

func (f *fakeD1) Query(dbID, sql string, params ...any) ([]map[string]any, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case strings.Contains(sql, "bridge_inbox") && strings.Contains(sql, "done=0"):
		var out []map[string]any
		for _, r := range f.inbox {
			if r["done"].(float64) == 0 {
				out = append(out, r)
			}
		}
		return out, nil
	case strings.Contains(sql, "MAX(id)"):
		return []map[string]any{{"m": float64(f.outSeq)}}, nil
	}
	return nil, nil
}

func (f *fakeD1) Exec(dbID, sql string, params ...any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	switch {
	case strings.Contains(sql, "INSERT INTO bridge_inbox"):
		f.inboxSeq++
		f.inbox = append(f.inbox, map[string]any{"id": float64(f.inboxSeq), "cmd": params[1], "done": float64(0)})
	case strings.Contains(sql, "INSERT INTO bridge_outbox"):
		f.outSeq++
		f.outbox = append(f.outbox, map[string]any{"id": float64(f.outSeq), "text": params[1]})
	case strings.Contains(sql, "UPDATE bridge_inbox"):
		id := params[0].(int64)
		for _, r := range f.inbox {
			if r["id"].(float64) == float64(id) {
				r["done"] = float64(1)
			}
		}
	}
	return nil
}

func bridgeEngine(t *testing.T) (*Engine, *fakeD1) {
	t.Helper()
	srv := panelStub(t)
	st := store.Open(t.TempDir() + "/state.json")
	cfg := &config.Config{
		Panel:     config.Deployment{URL: srv.URL, Gate: "g", BotKey: "vtk_t", D1ID: "db1"},
		AdminChat: 0, // no telegram mirror in tests
		VoltDir:   t.TempDir(),
	}
	e := NewEngine(cfg, telegram.New(""), panel.New(srv.URL, "vtk_t"), nil, st)
	e.Locs = []Loc{{ID: "it", Fa: "ایتالیا", Flag: "🇮🇹"}}
	return e, &fakeD1{}
}

func TestBridgePrimeSkipsOldOutbox(t *testing.T) {
	_, f := bridgeEngine(t)
	br := NewBridge(nil, f, "db1")
	_ = f.Exec("db1", "INSERT INTO bridge_outbox (ts, text) VALUES (?, ?)", int64(1), "قدیمی")
	br.primeOutbox()
	if br.LastID != 1 {
		t.Fatalf("prime = %d, want 1", br.LastID)
	}
}

func TestBridgeDrainsInbox(t *testing.T) {
	e, f := bridgeEngine(t)
	br := NewBridge(e, f, "db1")
	br.primeOutbox()

	_ = f.Exec("db1", "INSERT INTO bridge_inbox (ts, cmd) VALUES (?, ?)", int64(1), "/stats")
	_ = f.Exec("db1", "INSERT INTO bridge_inbox (ts, cmd) VALUES (?, ?)", int64(2), "/keys")

	br.Once()

	// both replies landed in outbox
	if len(f.outbox) != 2 {
		t.Fatalf("outbox rows = %d, want 2", len(f.outbox))
	}
	// inbox fully drained (done=1)
	rows, _ := f.Query("db1", "SELECT id, cmd FROM bridge_inbox WHERE done=0 ORDER BY id ASC LIMIT 5")
	if len(rows) != 0 {
		t.Fatalf("inbox not drained: %d", len(rows))
	}
	// replies came from the real router (stats text)
	if !strings.Contains(f.outbox[0]["text"].(string), "آمار پنل") {
		t.Fatalf("unexpected reply: %v", f.outbox[0]["text"])
	}
}

func TestBridgeEmptyIsNoop(t *testing.T) {
	e, f := bridgeEngine(t)
	br := NewBridge(e, f, "db1")
	br.primeOutbox()
	br.Once()
	if len(f.outbox) != 0 {
		t.Fatalf("outbox should stay empty, got %d", len(f.outbox))
	}
}

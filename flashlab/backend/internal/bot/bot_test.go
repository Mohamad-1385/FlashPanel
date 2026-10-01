// Package bot tests — Persian rendering + router behavior.
package bot

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"flashlab/internal/config"
	"flashlab/internal/cfapi"
	"flashlab/internal/panel"
	"flashlab/internal/store"
	"flashlab/internal/telegram"
)

func panelStub(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/api/v1/keys"):
			_, _ = w.Write([]byte(`{"ok":true,"keys":[{"id":1,"name":"تست","uuid":"11111111-2222-3333-4444-555555555555","loc":"it","ip_mode":"rotate","adblock":1,"status":"active","quota_gb":0,"used_bytes":1048576}]}`))
		case strings.HasSuffix(r.URL.Path, "/api/v1/stats"):
			_, _ = w.Write([]byte(`{"ok":true,"stats":{"keys":1,"active":1,"online":0,"trafficToday":0,"lifetimeBytes":1048576,"locations":33,"build":"1.0.0"},"settings":{"adblock":1,"ip_mode":"rotate","panel_name":"FLASHLAB"}}`))
		case strings.HasSuffix(r.URL.Path, "/api/v1/health"):
			_, _ = w.Write([]byte(`{"ok":true,"build":"1.0.0","core":"FLASHLAB-GO/1.0","name":"FLASHLAB"}`))
		default:
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	}))
}

func testEngine(t *testing.T) *Engine {
	t.Helper()
	srv := panelStub(t)
	t.Cleanup(srv.Close)
	st := store.Open(t.TempDir() + "/state.json")
	st.AddAdmin(42)
	cfg := &config.Config{
		Panel: config.Deployment{
			URL: srv.URL, Gate: "gg1234", BotKey: "flk_test", D1ID: "d1-test",
		},
		AdminChat: 0,
		FlDir:   t.TempDir(),
	}
	e := NewEngine(cfg, telegram.New(""), panel.New(srv.URL, "flk_test"), &cfapi.Client{AccountID: "acc", Token: "tok"}, st)
	e.Locs = []Loc{
		{ID: "it", Fa: "ایتالیا", Flag: "🇮🇹"},
		{ID: "de", Fa: "آلمان", Flag: "🇩🇪"},
	}
	return e
}

func TestFaDigits(t *testing.T) {
	got := FaDigits("123GB / 456")
	want := "۱۲۳GB / ۴۵۶"
	if got != want {
		t.Fatalf("FaDigits = %q, want %q", got, want)
	}
}

func TestFaBytes(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{512, "۵۱۲ بایت"},
		{5 << 20, "۵٫۰ مگابایت"},
		{(3 * 1 << 30) + 500*1<<20, "۳٫۵ گیگابایت"},
	}
	for _, c := range cases {
		got := FaBytes(c.in)
		if got != c.want {
			t.Errorf("FaBytes(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestRouterAdminGate(t *testing.T) {
	e := testEngine(t)
	// stranger: public commands OK, admin commands blocked
	if !strings.Contains(e.Handle(999, "/start"), "فلش") {
		t.Fatal("/start must work for strangers")
	}
	if e.Handle(999, "/keys") != txtNotAdmin {
		t.Fatal("/keys must be admin-only")
	}
	// bridge (id -1) is admin by construction
	if !strings.Contains(e.Handle(-1, "/keys"), "کلید") {
		t.Fatal("bridge /keys must be treated as admin")
	}
}

func TestRouterUnknown(t *testing.T) {
	e := testEngine(t)
	if !strings.Contains(e.Handle(42, "/nope"), "ناشناخته") {
		t.Fatal("unknown command hint missing")
	}
}

func TestUUIDValidation(t *testing.T) {
	e := testEngine(t)
	// malformed uuid → usage hint, not a panel call
	if !strings.Contains(e.Handle(42, "/delkey xyz"), "شناسهٔ کلید") {
		t.Fatal("uuid validation failed")
	}
}

func TestNewKeyUsageHint(t *testing.T) {
	e := testEngine(t)
	out := e.Handle(42, "سلام")
	if !strings.Contains(out, "/newkey") {
		t.Fatal("free text should hint /newkey")
	}
}

func TestLocNames(t *testing.T) {
	e := testEngine(t)
	if e.locName("it") != "🇮🇹 ایتالیا" {
		t.Fatal("locName(it) wrong")
	}
	if e.locName("xx") != "" {
		t.Fatal("unknown loc must be empty")
	}
}

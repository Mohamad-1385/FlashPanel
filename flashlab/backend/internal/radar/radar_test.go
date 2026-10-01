package radar

import (
	"fmt"
	"net"
	"testing"
	"time"
)

func TestScanAllSortsAliveFirst(t *testing.T) {
	// one unreachable relay + one that refuses instantly — both dead,
	// sorted after any alive entry (here: none alive, still well-formed).
	targets := []Target{
		{Loc: "it", Relay: "127.0.0.1:1-style-invalid-host"},
		{Loc: "de", Relay: "127.0.0.1"},
	}
	res := ScanAll(targets, 4, 300*time.Millisecond)
	if len(res) != 2 {
		t.Fatalf("want 2 results, got %d", len(res))
	}
	for _, r := range res {
		if r.OK {
			t.Fatalf("nothing should be alive on localhost: %v", r)
		}
		if r.Loc == "" {
			t.Fatalf("loc must be attached: %+v", r)
		}
	}
}

func TestScanOneAliveRelayShape(t *testing.T) {
	// A local TLS listener cannot answer the cp.cloudflare.com SNI handshake,
	// so an accept-only endpoint must be reported dead (the P181 black-hole
	// lesson: accepting TCP is NOT forwarding).
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Skip("no local listener:", err)
	}
	defer ln.Close()
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			c.Close() // accept + immediately close = the classic fake relay
		}
	}()
	port := ln.Addr().(*net.TCPAddr).Port
	r := ScanOne(fmt.Sprintf("127.0.0.1:%d", port), 500*time.Millisecond)
	if r.OK {
		t.Fatalf("accept-only endpoint must NOT count as forwarding: %+v", r)
	}
	if r.Ms < 0 || r.Ts == 0 {
		t.Fatalf("bad result shape: %+v", r)
	}
}

func TestReportPersianDigits(t *testing.T) {
	res := []Result{
		{Loc: "it", Relay: "1.2.3.4", Ms: 120, OK: true, Ts: 1},
		{Loc: "de", Relay: "5.6.7.8", Ms: 4000, OK: false, Ts: 1},
	}
	r := Report(res, func(id string) string { return "🇮🇹 ایتالیا" })
	for _, want := range []string{"۱۲۰", "ایتالیا", "۱", "۲", "رادار"} {
		if !contains(r, want) {
			t.Fatalf("report missing %q:\n%s", want, r)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && idx(s, sub) >= 0)
}
func idx(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

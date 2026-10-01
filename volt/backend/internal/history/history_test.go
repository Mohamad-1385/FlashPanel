// Package history tests — trend rendering + memory store.
package history

import (
	"strings"
	"testing"
)

func TestTrendRenders(t *testing.T) {
	rows := []Row{
		{Hour: 100, Bytes: 1000, Keys: 1},
		{Hour: 101, Bytes: 3000, Keys: 2}, // +2000
		{Hour: 102, Bytes: 8000, Keys: 2}, // +5000 (max)
		{Hour: 103, Bytes: 9000, Keys: 3}, // +1000
	}
	out := Trend(rows, 24)
	if !strings.Contains(out, "روند مصرف") {
		t.Fatalf("trend header missing: %.80s", out)
	}
	if !strings.Contains(out, "کیلوبایت") {
		t.Fatalf("trend must render human bytes: %.120s", out)
	}
	if strings.Count(out, "\n") < 3 {
		t.Fatalf("expected 3 bar lines: %s", out)
	}
}

func TestTrendEmpty(t *testing.T) {
	if !strings.Contains(Trend(nil, 12), "هنوز داده‌ای") {
		t.Fatal("empty trend message missing")
	}
}

func TestMemStoreRoundtrip(t *testing.T) {
	m := &MemStore{}
	_ = m.Append(Row{Hour: 10, Bytes: 5, Keys: 1})
	_ = m.Append(Row{Hour: 11, Bytes: 9, Keys: 2})
	got, err := m.Since(10)
	if err != nil || len(got) != 2 {
		t.Fatalf("Since: %v len=%d", err, len(got))
	}
	old, _ := m.Since(11)
	if len(old) != 1 {
		t.Fatalf("floor filter failed: %d", len(old))
	}
}

func TestSnapshooterOnce(t *testing.T) {
	m := &MemStore{}
	src := &fakeStats{keys: 3, traffic: 12345}
	s := &Snapshooter{Store: m, Panel: src}
	s.Once()
	if len(m.Rows) != 1 || m.Rows[0].Keys != 3 || m.Rows[0].Bytes != 12345 {
		t.Fatalf("snapshot wrong: %+v", m.Rows)
	}
}

type fakeStats struct{ keys, active, traffic int64; n int }

func (f *fakeStats) Stats() (int, int, int64, error) { return int(f.keys), int(f.active), f.traffic, nil }

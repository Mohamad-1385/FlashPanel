// Package history — hourly traffic snapshots (D1 or memory) + the Persian
// /trend sparkline report. Standalone package (no bot dependency → no cycles).
package history

import (
	"fmt"
	"strings"
	"time"

	"volt/internal/cfapi"
	"volt/internal/fa"
)

// Row is one hourly snapshot.
type Row struct {
	Hour  int64 `json:"hour"`  // unix hour bucket
	Bytes int64 `json:"bytes"` // cumulative daily traffic at snapshot time
	Keys  int   `json:"keys"`  // active keys at snapshot time
}

// Store persists snapshots.
type Store interface {
	Append(row Row) error
	Since(hourFloor int64) ([]Row, error)
}

// StatsSource is the minimal stats surface (satisfied by *panel.Client).
type StatsSource interface {
	Stats() (keys int, active int, trafficToday int64, err error)
}

// Snapshooter captures panel stats into the store every hour.
type Snapshooter struct {
	Store Store
	Panel StatsSource
}

// Run snapshots hourly (call in a goroutine).
func (s *Snapshooter) Run() {
	s.Once()
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for range t.C {
		s.Once()
	}
}

// Once captures one snapshot.
func (s *Snapshooter) Once() {
	keys, _, traffic, err := s.Panel.Stats()
	if err != nil {
		return
	}
	_ = s.Store.Append(Row{
		Hour:  time.Now().Unix() / 3600,
		Bytes: traffic,
		Keys:  keys,
	})
}

// Trend renders the last N hours as a Persian sparkline report.
func Trend(rows []Row, n int) string {
	if len(rows) == 0 {
		return "هنوز داده‌ای ثبت نشده — بعد از اولین ساعت گزارش می‌آید."
	}
	for i := 0; i < len(rows); i++ {
		for j := i + 1; j < len(rows); j++ {
			if rows[j].Hour < rows[i].Hour {
				rows[i], rows[j] = rows[j], rows[i]
			}
		}
	}
	if n > len(rows) {
		n = len(rows)
	}
	rows = rows[len(rows)-n:]

	var b strings.Builder
	b.WriteString("📈 روند مصرف (ساعت به ساعت):\n\n")
	max := int64(1)
	var deltas []int64
	for i := 1; i < len(rows); i++ {
		d := rows[i].Bytes - rows[i-1].Bytes
		if d < 0 {
			d = rows[i].Bytes // day rollover — cumulative reset
		}
		deltas = append(deltas, d)
		if d > max {
			max = d
		}
	}
	for i, d := range deltas {
		barN := int(d * 10 / max)
		if barN > 10 {
			barN = 10
		}
		if barN == 0 && d > 0 {
			barN = 1
		}
		localHour := ((rows[i+1].Hour*3600 + 12600) % 86400) / 3600 // Tehran (+03:30)
		bar := strings.Repeat("█", barN)
		if bar == "" {
			bar = "▏"
		}
		fmt.Fprintf(&b, "%s:۰۰ %s <b>%s</b>\n", fa.Digits(fmt.Sprintf("%02d", localHour)), bar, fa.Bytes(d))
	}
	if len(deltas) == 0 {
		b.WriteString("اولین اسنپ‌شات ثبت شد — از ساعت بعد روند دیده می‌شود.")
	}
	return b.String()
}

// ── D1-backed store ──

// D1Store persists snapshots into the panel's D1 database.
type D1Store struct {
	CF   *cfapi.Client
	DBID string
}

// NewD1Store builds the D1-backed history store.
func NewD1Store(cf *cfapi.Client, dbID string) *D1Store {
	return &D1Store{CF: cf, DBID: dbID}
}

// Append writes one snapshot row (table auto-created).
func (h *D1Store) Append(r Row) error {
	if err := h.CF.Exec(h.DBID,
		"CREATE TABLE IF NOT EXISTS history_hourly (hour INTEGER PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0, keys INTEGER NOT NULL DEFAULT 0)"); err != nil {
		return err
	}
	return h.CF.Exec(h.DBID,
		"INSERT OR REPLACE INTO history_hourly (hour, bytes, keys) VALUES (?, ?, ?)", r.Hour, r.Bytes, r.Keys)
}

// Since reads rows newer than the hour floor.
func (h *D1Store) Since(hourFloor int64) ([]Row, error) {
	rows, err := h.CF.Query(h.DBID,
		"SELECT hour, bytes, keys FROM history_hourly WHERE hour > ? ORDER BY hour ASC LIMIT 168", hourFloor)
	if err != nil {
		return nil, err
	}
	out := make([]Row, 0, len(rows))
	for _, r := range rows {
		row := Row{}
		if v, ok := r["hour"].(float64); ok {
			row.Hour = int64(v)
		}
		if v, ok := r["bytes"].(float64); ok {
			row.Bytes = int64(v)
		}
		if v, ok := r["keys"].(float64); ok {
			row.Keys = int(v)
		}
		out = append(out, row)
	}
	return out, nil
}

// ── in-memory store (tests) ──

// MemStore is the in-memory Store.
type MemStore struct {
	Rows []Row
}

// Append stores in memory.
func (m *MemStore) Append(r Row) error { m.Rows = append(m.Rows, r); return nil }

// Since returns rows from the last N hour-buckets.
func (m *MemStore) Since(hourFloor int64) ([]Row, error) {
	out := []Row{}
	for _, r := range m.Rows {
		if r.Hour >= hourFloor {
			out = append(out, r)
		}
	}
	return out, nil
}

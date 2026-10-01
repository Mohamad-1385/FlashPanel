// Package radar — the concurrent relay scanner (FLASHLAB's Go power feature).
// Every relay of every location is probed IN PARALLEL (goroutines + semaphore):
// a TLS handshake with SNI=cp.cloudflare.com through relay:443 proves the relay
// really FORWARDS Cloudflare traffic (an accept-without-forward relay would
// pass a plain TCP check but never complete the SNI handshake — the P181
// "black hole" lesson). Results land in the panel D1 `radar` table where:
//   • the worker's turbo ordering picks the fastest relay per country
//   • the panel's radar view renders the live table
//   • the bot's /radar + /best commands report it in Persian
package radar

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"sort"
	"strings"
	"sync"
	"time"

	"flashlab/internal/cfapi"
	"flashlab/internal/fa"
)

// ProbeHost is the SNI used for the forwarding proof (Cloudflare's own
// connectivity-check origin — the exact host v2rayNG pings).
const ProbeHost = "cp.cloudflare.com"

// Result is one relay measurement.
type Result struct {
	Loc   string `json:"loc"`
	Relay string `json:"relay"`
	Ms    int64  `json:"ms"`
	OK    bool   `json:"ok"`
	Ts    int64  `json:"ts"`
}

// Target is one relay of one location (fed from the worker's catalog).
type Target struct {
	Loc   string
	LocFa string
	Flag  string
	Relay string
}

// ScanOne measures one relay: TLS handshake with the probe SNI through the
// relay. ok=false covers refused/timeout/handshake-failure — i.e. every way a
// relay can be dead or non-forwarding.
func ScanOne(relay string, timeout time.Duration) Result {
	t0 := time.Now()
	d := &net.Dialer{Timeout: timeout}
	conn, err := tls.DialWithDialer(d, "tcp", net.JoinHostPort(relay, "443"), &tls.Config{
		ServerName: ProbeHost, // SNI pass-through: the relay routes by this name
	})
	if err != nil {
		return Result{Relay: relay, Ms: time.Since(t0).Milliseconds(), OK: false, Ts: time.Now().UnixMilli()}
	}
	ms := time.Since(t0).Milliseconds()
	_ = conn.Close()
	return Result{Relay: relay, Ms: ms, OK: true, Ts: time.Now().UnixMilli()}
}

// ScanAll probes every target concurrently (semaphore-bounded). Returns all
// results sorted: alive first (by latency), dead last. This is the function
// that shows what Go goroutines buy us — 30+ relays measured in the time of
// the slowest one, not the sum.
func ScanAll(targets []Target, concurrency int, timeout time.Duration) []Result {
	if concurrency <= 0 {
		concurrency = 12
	}
	if timeout <= 0 {
		timeout = 4 * time.Second
	}
	var (
		wg  sync.WaitGroup
		sem = make(chan struct{}, concurrency)
		mu  sync.Mutex
		out = make([]Result, 0, len(targets))
	)
	for _, t := range targets {
		wg.Add(1)
		go func(t Target) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			r := ScanOne(t.Relay, timeout)
			r.Loc = t.Loc
			mu.Lock()
			out = append(out, r)
			mu.Unlock()
		}(t)
	}
	wg.Wait()
	sort.Slice(out, func(i, j int) bool {
		if out[i].OK != out[j].OK {
			return out[i].OK
		}
		return out[i].Ms < out[j].Ms
	})
	return out
}

// ── D1 persistence (the worker + panel read this table) ──

// D1Store writes scan results into the panel's D1 `radar` table.
type D1Store struct {
	CF   *cfapi.Client
	DBID string
}

// NewD1Store builds the radar D1 store.
func NewD1Store(cf *cfapi.Client, dbID string) *D1Store { return &D1Store{CF: cf, DBID: dbID} }

// Save persists a full scan (one row per relay; latest scan wins per relay).
func (d *D1Store) Save(results []Result) error {
	if len(results) == 0 {
		return nil
	}
	if err := d.CF.Exec(d.DBID, `CREATE TABLE IF NOT EXISTS radar (
		relay TEXT PRIMARY KEY, loc TEXT NOT NULL, ms INTEGER NOT NULL, ok INTEGER NOT NULL, ts INTEGER NOT NULL)`); err != nil {
		return err
	}
	for _, r := range results {
		ok := 0
		if r.OK {
			ok = 1
		}
		if err := d.CF.Exec(d.DBID,
			"INSERT OR REPLACE INTO radar (relay, loc, ms, ok, ts) VALUES (?, ?, ?, ?, ?)",
			r.Relay, r.Loc, r.Ms, ok, r.Ts); err != nil {
			return err
		}
	}
	return nil
}

// Latest reads the freshest row per relay (the turbo source of truth).
func (d *D1Store) Latest() ([]Result, error) {
	rows, err := d.CF.Query(d.DBID, "SELECT relay, loc, ms, ok, ts FROM radar ORDER BY ms ASC LIMIT 200")
	if err != nil {
		return nil, err
	}
	out := make([]Result, 0, len(rows))
	for _, r := range rows {
		res := Result{}
		if v, ok := r["relay"].(string); ok {
			res.Relay = v
		}
		if v, ok := r["loc"].(string); ok {
			res.Loc = v
		}
		if v, ok := r["ms"].(float64); ok {
			res.Ms = int64(v)
		}
		if v, ok := r["ok"].(float64); ok {
			res.OK = v == 1
		}
		if v, ok := r["ts"].(float64); ok {
			res.Ts = int64(v)
		}
		out = append(out, res)
	}
	return out, nil
}

// Report renders a Persian scan report (bot /radar).
func Report(results []Result, locName func(string) string) string {
	if len(results) == 0 {
		return "رادار هنوز داده‌ای ندارد — چند لحظه بعد دوباره بزن."
	}
	alive := 0
	for _, r := range results {
		if r.OK {
			alive++
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "📡 <b>رادار رله‌ها</b> — %s رلهٔ زنده از %s\n\n", fa.Digits(fmt.Sprint(alive)), fa.Digits(fmt.Sprint(len(results))))
	shown := 0
	for _, r := range results {
		if !r.OK {
			break
		}
		if shown >= 8 {
			break
		}
		name := r.Relay
		if locName != nil {
			if n := locName(r.Loc); n != "" {
				name = n + " · <code>" + r.Relay + "</code>"
			}
		}
		fmt.Fprintf(&b, "🟢 %s — <b>%s م‌ث</b>\n", name, fa.Digits(fmt.Sprint(r.Ms)))
		shown++
	}
	dead := 0
	for _, r := range results {
		if !r.OK {
			dead++
		}
	}
	if dead > 0 {
		fmt.Fprintf(&b, "\n⛔ %s رلهٔ مرده/کند شناسایی شد — توربو از آن‌ها دوری می‌کند.", fa.Digits(fmt.Sprint(dead)))
	}
	return b.String()
}

// Runner is the periodic scan loop (owned by flashd).
type Runner struct {
	Store       *D1Store
	FetchTarget func() []Target // pulls the catalog (worker /api/v1/locations?full=1)
	Every       time.Duration
	Last        []Result
	LastScan    time.Time
	mu          sync.Mutex
}

// Run scans immediately, then on every tick (call in a goroutine).
func (r *Runner) Run(ctx context.Context) {
	if r.Every <= 0 {
		r.Every = 10 * time.Minute
	}
	r.Once()
	t := time.NewTicker(r.Every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.Once()
		}
	}
}

// Once runs one scan cycle and persists it.
func (r *Runner) Once() []Result {
	targets := r.FetchTarget()
	if len(targets) == 0 {
		return nil
	}
	results := ScanAll(targets, 12, 4*time.Second)
	r.mu.Lock()
	r.Last = results
	r.LastScan = time.Now()
	r.mu.Unlock()
	if r.Store != nil {
		_ = r.Store.Save(results)
	}
	return results
}

// Snapshot returns the latest in-memory scan (panel/bot fast path).
func (r *Runner) Snapshot() ([]Result, time.Time) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.Last, r.LastScan
}

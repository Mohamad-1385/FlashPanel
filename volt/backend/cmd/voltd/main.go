// voltd — the VOLT Go daemon (75% of the architecture):
//   • bridge loop: D1 inbox/outbox ↔ the panel terminal
//   • telegram loop: dedicated-token long-poll (when volt/.bot-token exists)
//   • monitor: local HTTP status/metrics
//   • heartbeat + hourly admin report
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"volt/internal/bot"
	"volt/internal/cfapi"
	"volt/internal/config"
	"volt/internal/history"
	"volt/internal/monitor"
	"volt/internal/panel"
	"volt/internal/store"
	"volt/internal/telegram"
)

const voltDir = "/home/z/my-project/volt"

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.Println("VOLT voltd — starting (Go backend + bot)")

	cfg, err := config.Load(voltDir)
	if err != nil {
		log.Fatalf("config: %v", err)
	}
	stPath := filepath.Join(voltDir, "backend-state.json")
	st := store.Open(stPath)
	st.Update(func(s *store.State) { s.StartedAt = time.Now().UnixMilli() })

	tg := telegram.New(cfg.TelegramTok)
	pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
	cf := cfapi.New(cfg.Panel.AccountID, cfg.CFToken)
	eng := bot.NewEngine(cfg, tg, pc, cf, st)

	// mirror the location catalog from the panel (for Persian labels)
	if locs, err := fetchLocations(pc); err == nil {
		eng.Locs = locs
	}

	// telegram identity (best-effort — bridge works without it)
	if cfg.TelegramTok != "" {
		if me, err := tg.GetMe(); err == nil {
			log.Printf("telegram: @%s online", me.Username)
		} else {
			log.Printf("telegram identity: %v (bridge mode still works)", err)
		}
	}

	// bootstrap announcement → admin (direct send is conflict-free)
	if cfg.AdminChat > 0 && cfg.TelegramTok != "" {
		if _, err := tg.SendMessage(cfg.AdminChat, eng.BootstrapAnnounce(), nil); err != nil {
			log.Printf("bootstrap announce: %v", err)
		}
	}

	// bridge loop — always on
	br := bot.NewBridge(eng, cf, cfg.Panel.D1ID)
	go br.Run()

	// dedicated-token long-poll loop (only when volt/.bot-token exists)
	dedicated := fileExists(filepath.Join(voltDir, ".bot-token"))
	if dedicated {
		go telegramLoop(eng, tg, st)
	} else {
		log.Println("telegram: shared token (bridge mode) — send/notify only; dedicated polling disabled")
	}

	// health watcher — panel liveness + traffic trend + alerts
	watch := monitor.New(pc, tg, cfg.AdminChat)
	go watch.Run()

	// hourly traffic history (D1-backed) + /trend
	hist := history.NewD1Store(cf, cfg.Panel.D1ID)
	eng.History = hist
	snap := &history.Snapshooter{Store: hist, Panel: &panelStats{pc}}
	go snap.Run()

	// hourly admin report (includes the monitor trend)
	go hourlyReport(eng, st, watch)

	// monitor HTTP
	go monitorServer(cfg, eng, st)

	// heartbeat
	go heartbeat()

	log.Printf("voltd up — panel %s · monitor :%s · bridge D1 %s", cfg.Panel.URL, cfg.MonitorPort, cfg.Panel.D1ID[:8]+"…")
	select {} // run forever — the supervisor (relaunch.sh) restarts on crash
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func fetchLocations(pc *panel.Client) ([]bot.Loc, error) {
	resp, err := http.Get(pc.Base + "/api/v1/locations")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out struct {
		OK        bool     `json:"ok"`
		Locations []bot.Loc `json:"locations"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out.Locations, nil
}

// telegramLoop is the real long-polling consumer (dedicated token only).
func telegramLoop(eng *bot.Engine, tg *telegram.Client, st *store.Store) {
	var offset int64
	log.Println("telegram long-poll loop: active")
	for {
		ups, err := tg.GetUpdates(offset, 25)
		if err != nil {
			if strings.Contains(err.Error(), "409") || strings.Contains(err.Error(), "Conflict") {
				log.Printf("telegram 409 (token in webhook mode) — backing off 60s")
				time.Sleep(60 * time.Second)
				continue
			}
			time.Sleep(3 * time.Second)
			continue
		}
		for _, u := range ups {
			if u.UpdateID >= offset {
				offset = u.UpdateID + 1
			}
			switch {
			case u.Message != nil && u.Message.Text != "":
				go func(m *telegram.Message) {
					if m.Text == "/start" || m.Text == "/menu" {
						if _, err := tg.SendMessage(m.Chat.ID, eng.Handle(m.From.ID, m.Text), bot.Menu()); err != nil {
							log.Printf("send: %v", err)
						}
						return
					}
					if _, err := tg.SendMessage(m.Chat.ID, eng.Handle(m.From.ID, m.Text), nil); err != nil {
						log.Printf("send: %v", err)
					}
				}(u.Message)
			case u.CallbackQuery != nil:
				go func(cq *telegram.CallbackQuery) {
					_ = tg.AnswerCallbackQuery(cq.ID, "دریافت شد")
					reply, kb := eng.HandleCallback(cq.From.ID, cq.Data)
					if cq.Message != nil {
						if err := tg.EditMessageText(cq.Message.Chat.ID, cq.Message.MessageID, reply, kb); err != nil {
							_, _ = tg.SendMessage(cq.Message.Chat.ID, reply, kb)
						}
					}
				}(u.CallbackQuery)
			}
		}
	}
}

func hourlyReport(eng *bot.Engine, st *store.Store, watch *monitor.Watch) {
	for {
		time.Sleep(time.Hour)
		if eng.Cfg.AdminChat > 0 && eng.TG != nil && eng.TG.Token != "" {
			body := eng.Handle(eng.Cfg.AdminChat, "/report") + "\n\n" + watch.Trend()
			if _, err := eng.TG.SendMessage(eng.Cfg.AdminChat, body, nil); err != nil {
				log.Printf("hourly report: %v", err)
			}
		}
	}
}

func monitorServer(cfg *config.Config, eng *bot.Engine, st *store.Store) {
	mux := http.NewServeMux()
	mux.HandleFunc("/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json; charset=utf-8")
		s := st.Get()
		h, herr := eng.Panel.Health()
		stt, _, serr := eng.Panel.Stats()
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "daemon": "voltd", "lang": "go", "arch": "75% Go / 20% TS / 5% Tailwind",
			"panel": map[string]any{
				"url": cfg.Panel.URL, "health_ok": herr == nil && h.OK,
				"build": h.Build, "keys": stt.Keys, "active": stt.Active,
				"online": stt.Online, "traffic_today": stt.TrafficToday,
				"stats_err": serrToString(serr),
			},
			"daemon_stats": map[string]any{
				"uptime_s": time.Now().UnixMilli()/1000 - s.StartedAt/1000,
				"cmds": s.CmdCount, "keys_created": s.KeysCreated, "admins": s.Admins,
			},
			"ts": time.Now().UnixMilli(),
		})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "text/html; charset=utf-8")
		fmt.Fprintf(w, `<!doctype html><html><head><meta charset="utf-8"><title>voltd</title></head>
<body style="background:#07090d;color:#d8ff3d;font-family:monospace;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1>VOLT voltd</h1><p style="color:#889">Go backend daemon — 75%% of the VOLT architecture</p>
<p><a style="color:#d8ff3d" href="/status">/status</a></p></div></body></html>`)
	})
	srv := &http.Server{Addr: "127.0.0.1:" + cfg.MonitorPort, Handler: mux}
	log.Printf("monitor: listening on :%s", cfg.MonitorPort)
	if err := srv.ListenAndServe(); err != nil {
		log.Printf("monitor: %v", err)
	}
}

// panelStats adapts *panel.Client to the bot.StatsSource interface.
type panelStats struct{ p *panel.Client }

func (a *panelStats) Stats() (keys int, active int, trafficToday int64, err error) {
	st, _, e := a.p.Stats()
	if e != nil {
		return 0, 0, 0, e
	}
	return st.Keys, st.Active, st.TrafficToday, nil
}

func serrToString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func heartbeat() {
	for {
		_ = os.WriteFile(filepath.Join(voltDir, "daemon.heartbeat"), []byte(fmt.Sprintf("%d", time.Now().UnixMilli())), 0o600)
		time.Sleep(30 * time.Second)
	}
}

// graceful shutdown guard (unused signal var keeps imports honest on some builds)
var _ = signal.Notify
var _ = syscall.SIGTERM

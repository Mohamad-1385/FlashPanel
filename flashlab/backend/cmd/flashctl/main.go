// flashctl — the FLASHLAB management CLI (Go, part of the 75%).
//
//      flashctl deploy [--name x] [--admin-chat id]   → full provision flow
//      flashctl delete                                 → teardown worker + D1
//      flashctl status                                 → live panel + daemon status
//      flashctl keys                                   → list keys
//      flashctl stats                                  → panel stats JSON
//      flashctl vault                                  → extract CF token from the flash vault
//      flashctl version
package main

import (
        "encoding/json"
        "flag"
        "fmt"
        "io"
        "net/http"
        "os"
        "path/filepath"
        "strings"
        "time"

        "flashlab/internal/cfapi"
        "flashlab/internal/config"
        "flashlab/internal/deploy"
        "flashlab/internal/panel"
        "flashlab/internal/radar"
        "flashlab/internal/telegram"
        "flashlab/internal/vault"
        "flashlab/internal/vlessprobe"
)

const flDir = "/home/z/my-project/flashlab"
const flashDir = "/home/z/my-project/flash"
const cfOwner = "7544772205" // vault entry (the admin's account)

func main() {
        if len(os.Args) < 2 {
                usage()
                os.Exit(2)
        }
        cmd := os.Args[1]
        fs := flag.NewFlagSet(cmd, flag.ExitOnError)
        switch cmd {
        case "deploy":
                name := fs.String("name", "", "worker name (default: flashlab-XXXX)")
                chat := fs.Int64("admin-chat", 7544772205, "admin telegram chat id")
                _ = fs.Parse(os.Args[2:])
                doDeploy(*name, *chat)
        case "push":
                doPush()
        case "verify":
                doVerify()
        case "report":
                doReport()
        case "delete":
                doDelete()
        case "status":
                doStatus()
        case "keys":
                doKeys()
        case "stats":
                doStats()
        case "vault":
                doVault()
        case "speed":
                if len(os.Args) < 3 {
                        fatal("usage: flashctl speed <uuid> [MB]")
                }
                mb := 5
                if len(os.Args) > 3 {
                        fmt.Sscanf(os.Args[3], "%d", &mb)
                }
                doSpeed(os.Args[2], mb)
        case "radar":
                doRadar()
        case "best":
                doBest()
        case "version":
                fmt.Println("flashctl 1.0.0 «صاعقه» — Go toolchain")
        default:
                usage()
                os.Exit(2)
        }
}

func usage() {
        fmt.Print(`flashctl — FLASHLAB management (Go)

commands:
  deploy [--name flashlab-xxxx] [--admin-chat id]   provision D1 + worker + config
  push                                              update the worker (same D1/secrets)
  verify                                            live E2E: health + tunnel + DNS + denial (Go VLESS client)
  report                                            Persian status report (text)
  delete                                            remove the deployed panel
  status                                            live panel + daemon status
  keys                                              list panel keys
  stats                                             panel stats (JSON)
  vault                                             extract CF token → flashlab/.cf-token
  version
`)
}

func loadCfg() *config.Config {
        cfg, err := config.Load(flDir)
        if err != nil {
                fatal("config: %v", err)
        }
        return cfg
}

func fatal(f string, a ...any) {
        fmt.Fprintf(os.Stderr, "flashctl: "+f+"\n", a...)
        os.Exit(1)
}

func cfClient(cfg *config.Config) *cfapi.Client {
        tok := cfg.CFToken
        if tok == "" {
                if t, err := vault.WriteCFToken(flashDir, flDir, cfOwner); err == nil {
                        tok = t
                } else {
                        fatal("CF token missing (run: flashctl vault): %v", err)
                }
        }
        return cfapi.New(cfg.Panel.AccountID, tok)
}

func doVault() {
        tok, err := vault.WriteCFToken(flashDir, flDir, cfOwner)
        if err != nil {
                fatal("vault: %v", err)
        }
        fmt.Printf("✓ CF token extracted (len %d) → flashlab/.cf-token (0600, mirrored to /tmp)\n", len(tok))
}

func doDeploy(name string, adminChat int64) {
        // CF token first (from the encrypted vault — pure Go AES-GCM)
        cfg0, _ := config.Load(flDir)
        if cfg0 != nil && cfg0.CFToken == "" {
                if _, err := vault.WriteCFToken(flashDir, flDir, cfOwner); err != nil {
                        fmt.Printf("[deploy] CF token: %v — pass it via flashlab/.cf-token\n", err)
                }
        }
        cfg, err := config.Load(flDir)
        if err != nil {
                fatal("config: %v", err)
        }
        if cfg.CFToken == "" {
                fatal("no CF token — run `flashctl vault` first")
        }
        accID := cfg.Panel.AccountID
        if accID == "" {
                // first deploy — resolve the token's account
                probe := cfapi.New("", cfg.CFToken)
                id, err := probe.FirstAccountID()
                if err != nil {
                        fatal("resolve account: %v", err)
                }
                accID = id
                fmt.Printf("[deploy] account resolved: %s\n", accID)
        }
        cf := cfapi.New(accID, cfg.CFToken)

        res, err := deploy.Provision(cf, flDir, name, adminChat)
        if err != nil {
                fatal("deploy: %v", err)
        }

        // live verify (retry — subdomain routing takes a moment)
        fmt.Println("[deploy] verifying (up to 60s) …")
        pc := panel.New(res.URL, res.BotKey)
        var healthy bool
        for i := 0; i < 12; i++ {
                time.Sleep(5 * time.Second)
                if h, err := pc.Health(); err == nil && h.OK {
                        healthy = true
                        fmt.Printf("[deploy] ✓ HEALTHY — build=%s core=%s name=%s\n", h.Build, h.Core, h.Name)
                        break
                }
                fmt.Print(".")
        }
        if !healthy {
                fmt.Println("\n[deploy] ⚠ worker deployed but health check pending (subdomain warmup) — check /status later")
        }

        fmt.Printf(`
╔══ FLASHLAB DEPLOYED ═══════════════════════════════╗
  میز فرمان : %s/g/%s
  ورکر      : %s (%s)
  دیتابیس   : %s (%s)
  تونل      : /%s/<uuid>/
  کد ادمین  : flashlab/.admin-code
╚════════════════════════════════════════════════╝
`, res.URL, res.Gate, res.Worker, res.URL, res.D1Name, res.D1ID, res.TPatch)

        // notify the admin from the Go toolchain itself
        cfgN, _ := config.Load(flDir)
        if cfgN != nil && cfgN.TelegramTok != "" {
                tg := telegram.New(cfgN.TelegramTok)
                msg := fmt.Sprintf("⚡ <b>FLASHLAB مستقر شد</b>\n\n🌐 میز فرمان: %s/g/%s\n🔋 دیپلوی با ابزار Go: <code>flashctl</code>\n🛰 ورکر: %s", res.URL, res.Gate, res.Worker)
                if _, err := tg.SendMessage(adminChat, msg, nil); err != nil {
                        fmt.Println("[deploy] admin notify:", err)
                } else {
                        fmt.Println("[deploy] ✓ admin notified on telegram")
                }
        }
}

func doPush() {
        cfg := loadCfg()
        if cfg.Panel.Worker == "" {
                fatal("no deployment found — run `flashctl deploy` first")
        }
        cf := cfClient(cfg)
        fmt.Printf("pushing worker update to %s …\n", cfg.Panel.Worker)
        if err := deploy.PushExisting(cf, flDir); err != nil {
                fatal("push: %v", err)
        }
        // verify
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        for i := 0; i < 10; i++ {
                time.Sleep(4 * time.Second)
                if h, err := pc.Health(); err == nil && h.OK {
                        fmt.Printf("✓ live — build=%s core=%s\n", h.Build, h.Core)
                        return
                }
                fmt.Print(".")
        }
        fmt.Println("\n⚠ health pending (edge warmup)")
}

func doVerify() {
        cfg := loadCfg()
        if cfg.Panel.Worker == "" {
                fatal("no deployment — run deploy first")
        }
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        fmt.Println("═══ FLASHLAB live E2E (native Go VLESS client) ═══")

        // 1) health
        h, err := pc.Health()
        mark("health", err == nil && h.OK, fmt.Sprintf("build=%s core=%s", h.Build, h.Core))

        // 2) create a throwaway key
        mk, err := pc.CreateKey(panel.NewKeyOpts{Name: "verify-go", Loc: "it"})
        if err != nil {
                mark("key create", false, err.Error())
                return
        }
        defer func() { _ = pc.DeleteKey(mk.UUID) }()
        mark("key create", true, mk.UUID[:8]+"…")

        // 3) sub formats
        base := cfg.Panel.URL + "/sub/" + mk.UUID
        for _, f := range []string{"base64", "xjson", "singbox", "clash"} {
                ok := false
                detail := ""
                if b, err := getBody(base + "?format=" + f); err == nil && len(b) > 40 {
                        ok = true
                        detail = fmt.Sprintf("%d bytes", len(b))
                        if f == "singbox" && strings.Contains(b, "domain_strategy") {
                                ok = false
                                detail += " — domain_strategy leaked (7.9.29 lesson!)"
                        }
                        if f == "xjson" && strings.Contains(b, "\"enabled\":true") {
                                ok = false
                                detail += " — mux must be off"
                        }
                }
                mark("sub "+f, ok, detail)
        }

        // 4) tunnel — HTTP through the Italian relay exit
        pr := &vlessprobe.Probe{Host: strings.TrimPrefix(cfg.Panel.URL, "https://"), Path: cfg.Panel.TPatch, UUID: mk.UUID}
        line, ms, err := pr.HTTP("gstatic.com", 80, "/generate_204")
        mark("VLESS TCP via IT relay", err == nil && strings.Contains(line, "HTTP/1."), fmt.Sprintf("%s (%dms)", line, ms))

        // 5) UDP-DNS bridge
        ok, ms, err := pr.DNSQuery("google.com")
        mark("UDP-DNS bridge", ok && err == nil, fmt.Sprintf("%dms", ms))

        // 6) wrong-uuid denial
        ok, err = pr.WrongUUID()
        mark("wrong-UUID denied", ok && err == nil, "no reply, no leak")

        fmt.Println("═══ verify done ═══")
}

func mark(name string, ok bool, detail string) {
        icon := "✓"
        if !ok {
                icon = "✗"
        }
        fmt.Printf("  %s %-22s %s\n", icon, name, detail)
}

func getBody(url string) (string, error) {
        resp, err := http.Get(url)
        if err != nil {
                return "", err
        }
        defer resp.Body.Close()
        b, err := io.ReadAll(resp.Body)
        return string(b), err
}

func doReport() {
        cfg := loadCfg()
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        h, _ := pc.Health()
        st, set, _ := pc.Stats()
        keys, _ := pc.ListKeys()
        ipm := "چرخشی 🔁"
        if set.IPMode == "fixed" {
                ipm = "ثابت 📌"
        }
        ad := "خاموش"
        if set.Adblock == 1 {
                ad = "روشن 🛡"
        }
        fmt.Printf(`⚡ گزارش FLASHLAB — %s
پنل        : %s (نسخهٔ %s · هستهٔ %s)
کلیدها     : %d (فعال %d)
مصرف امروز : %d بایت
حالت IP    : %s · ضدتبلیغ: %s
دروازه     : %s/g/%s
معماری     : Go (بک‌اند+ربات+ابزار) · TS (ورکر) · Tailwind (ظاهر)
`,
                time.Now().Format("15:04:05"), cfg.Panel.URL, h.Build, h.Core,
                len(keys), st.Active, st.TrafficToday, ipm, ad, cfg.Panel.URL, cfg.Panel.Gate)
}

func doDelete() {
        cfg := loadCfg()
        cf := cfClient(cfg)
        fmt.Printf("removing %s (worker %s + D1 %s) …\n", cfg.Panel.URL, cfg.Panel.Worker, cfg.Panel.D1Name)
        if err := deploy.Teardown(cf, flDir); err != nil {
                fatal("teardown: %v", err)
        }
        fmt.Println("✓ removed")
}

func doStatus() {
        cfg := loadCfg()
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        h, err := pc.Health()
        if err != nil {
                fatal("panel health: %v", err)
        }
        st, set, err := pc.Stats()
        if err != nil {
                fatal("panel stats: %v", err)
        }
        daemon := "down"
        if b, err := os.ReadFile(filepath.Join(flDir, "daemon.heartbeat")); err == nil {
                var ms int64
                fmt.Sscanf(strings.TrimSpace(string(b)), "%d", &ms)
                if time.Now().UnixMilli()-ms < 120000 {
                        daemon = "up"
                } else {
                        daemon = "stale"
                }
        }
        out, _ := json.MarshalIndent(map[string]any{
                "panel": h, "stats": st, "settings": set,
                "daemon": daemon, "url": cfg.Panel.URL, "gate_path": "/g/" + cfg.Panel.Gate,
        }, "", "  ")
        fmt.Println(string(out))
}

func doKeys() {
        cfg := loadCfg()
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        keys, err := pc.ListKeys()
        if err != nil {
                fatal("keys: %v", err)
        }
        for _, k := range keys {
                fmt.Printf("%s  %s  loc=%s  used=%d  status=%s\n", k.UUID, k.Name, k.Loc, k.UsedBytes, k.Status)
        }
        if len(keys) == 0 {
                fmt.Println("(no keys)")
        }
}

func doStats() {
        cfg := loadCfg()
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        st, set, err := pc.Stats()
        if err != nil {
                fatal("stats: %v", err)
        }
        out, _ := json.MarshalIndent(map[string]any{"stats": st, "settings": set}, "", "  ")
        fmt.Println(string(out))
}

// ── قدرت Go: تست سرعت و رادار از خود CLI ──

// doSpeed runs a REAL throughput test through the tunnel of one key.
func doSpeed(uuid string, mb int) {
        cfg := loadCfg()
        if mb <= 0 {
                mb = 5
        }
        host := cfg.Panel.URL
        host = strings.TrimPrefix(strings.TrimPrefix(host, "https://"), "http://")
        p := &vlessprobe.Probe{Host: host, Path: cfg.Panel.TPatch, UUID: uuid}
        st, err := p.SpeedTest(int64(mb) * 1024 * 1024)
        if err != nil {
                fatal("speed: %v", err)
        }
        fmt.Printf("⚡ فلش‌لب — تست سرعت واقعی از دل تونل\n\n")
        fmt.Printf("  دانلود   : %.2f MB در %d م‌ث → %.2f MB/s (%.1f Mbps)\n",
                float64(st.Bytes)/1048576, st.Ms, st.MBps, st.MBps*8)
        fmt.Printf("  پاسخ سرور: %s\n", st.First)
        fmt.Printf("  پینگ مستقیم (gstatic): %d م‌ث\n", st.DirectMs)
}

// doRadar runs a live concurrent scan of every location relay and prints the
// Persian report — the same engine the daemon runs every 10 minutes.
func doRadar() {
        cfg := loadCfg()
        cf := cfClient(cfg)
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        locs, err := pc.LocationsFull()
        if err != nil {
                fatal("catalog: %v", err)
        }
        targets := make([]radar.Target, 0, len(locs)*2)
        names := map[string]string{}
        for _, l := range locs {
                names[l.ID] = l.Flag + " " + l.Fa
                for _, r := range l.Relays {
                        targets = append(targets, radar.Target{Loc: l.ID, LocFa: l.Fa, Flag: l.Flag, Relay: r})
                }
        }
        fmt.Printf("📡 رادار فلش‌لب — اسکن همزمان %d رله با گوروتین…\n\n", len(targets))
        t0 := time.Now()
        res := radar.ScanAll(targets, 12, 4*time.Second)
        // the Report renderer targets Telegram HTML — strip the tags for the terminal
        plain := strings.NewReplacer("<b>", "", "</b>", "", "<code>", "", "</code>", "").Replace(radar.Report(res, func(id string) string { return names[id] }))
        fmt.Println(plain)
        fmt.Printf("\n  مدت اسکن: %s (همزمان — نه مجموع سری)\n", time.Since(t0).Round(time.Millisecond))
        store := radar.NewD1Store(cf, cfg.Panel.D1ID)
        if err := store.Save(res); err != nil {
                fmt.Printf("  ⚠ ذخیره در D1: %v\n", err)
        } else {
                fmt.Println("  ✓ در D1 ذخیره شد — توربو ورکر از همین استفاده می‌کند")
        }
}

// doBest lists the top-5 fastest verified relays from a fresh scan.
func doBest() {
        cfg := loadCfg()
        pc := panel.New(cfg.Panel.URL, cfg.Panel.BotKey)
        locs, err := pc.LocationsFull()
        if err != nil {
                fatal("catalog: %v", err)
        }
        names := map[string]string{}
        targets := make([]radar.Target, 0, len(locs)*2)
        for _, l := range locs {
                names[l.ID] = l.Flag + " " + l.Fa
                for _, r := range l.Relays {
                        targets = append(targets, radar.Target{Loc: l.ID, Relay: r})
                }
        }
        res := radar.ScanAll(targets, 12, 4*time.Second)
        alive := 0
        for _, r := range res {
                if r.OK {
                        alive++
                }
        }
        fmt.Printf("🏆 سریع‌ترین رله‌های تأییدشده (%d زنده از %d):\n\n", alive, len(res))
        for i, r := range res {
                if !r.OK || i >= 5 {
                        break
                }
                fmt.Printf("  %d. %s — %s — %d م‌ث\n", i+1, names[r.Loc], r.Relay, r.Ms)
        }
}

// Package monitor — VOLT health loop: panel liveness + relay reachability
// + traffic trend; alerts the admin on state changes (via Telegram sends).
package monitor

import (
        "fmt"
        "log"
        "time"

        "volt/internal/panel"
        "volt/internal/telegram"
)

// Alert is the admin-notifier signature.
type Alert func(text string)

// Watch polls the panel forever and alerts on transitions.
type Watch struct {
        Panel  *panel.Client
        TG     *telegram.Client
        Admin  int64
        // state
        lastOK     bool
        lastOnline int64
        fails      int
        hourly     map[int64]int64 // hour → traffic bytes
}

// New builds the watcher.
func New(p *panel.Client, tg *telegram.Client, admin int64) *Watch {
        return &Watch{Panel: p, TG: tg, Admin: admin, hourly: map[int64]int64{}}
}

// Run polls every 60s (call in a goroutine).
func (w *Watch) Run() {
        // first probe sets the baseline silently
        if st, _, err := w.Panel.Stats(); err == nil {
                w.lastOK = true
                w.lastOnline = int64(st.Online)
                w.recordHour(st.TrafficToday)
        }
        tick := time.NewTicker(60 * time.Second)
        defer tick.Stop()
        for range tick.C {
                w.once()
        }
}

func (w *Watch) recordHour(trafficToday int64) {
        h := time.Now().Unix() / 3600
        w.hourly[h] = trafficToday
        // keep 48h
        for k := range w.hourly {
                if k < h-48 {
                        delete(w.hourly, k)
                }
        }
}

func (w *Watch) once() {
        st, _, err := w.Panel.Stats()
        if err != nil {
                w.fails++
                if w.lastOK && w.fails >= 3 {
                        w.alert("⚠️ <b>هشدار VOLT</b>\n\nپنل پاسخ نمی‌دهد — ۳ خطای پشت‌سرهم.\n<i>بک‌اند Go زنده است و هر دقیقه دوباره می‌سنجد؛ پیام بعدی = بازگشت.</i>")
                        w.lastOK = false
                }
                return
        }
        w.recordHour(st.TrafficToday)
        if !w.lastOK && w.fails > 0 {
                w.alert("✅ <b>VOLT برگشت</b> — پنل دوباره سالم است (کلید فعال: " + fmt.Sprint(st.Active) + ")")
        }
        w.fails = 0
        w.lastOK = true

        // online transitions (اتصال تونل)
        on := int64(st.Online)
        if w.lastOnline == 0 && on > 0 {
                w.alert(fmt.Sprintf("🟢 اولین اتصال تونل ثبت شد — %d کاربر آنلاین", on))
        }
        w.lastOnline = on
}

func (w *Watch) alert(text string) {
        if w.Admin <= 0 || w.TG == nil || w.TG.Token == "" {
                log.Println("[monitor]", text)
                return
        }
        if _, err := w.TG.SendMessage(w.Admin, text, nil); err != nil {
                log.Printf("[monitor] alert: %v", err)
        }
}

// Trend renders the hourly traffic of the last 12h as a text sparkline.
func (w *Watch) Trend() string {
        now := time.Now().Unix() / 3600
        out := "📈 مصرف ساعتی (آخرین ۱۲ ساعت):\n"
        for i := 11; i >= 0; i-- {
                h := now - int64(i)
                v, ok := w.hourly[h]
                if !ok {
                        continue
                }
                bar := ""
                // scale: max 10 chars
                n := int(v / (1024 * 1024 * 50)) // 50MB per bar char
                if n > 10 {
                        n = 10
                }
                for j := 0; j < n; j++ {
                        bar += "█"
                }
                if bar == "" {
                        bar = "▏"
                }
                out += fmt.Sprintf("%02d:00 %s\n", (h*3600+12600)%86400/3600, bar)
        }
        return out
}

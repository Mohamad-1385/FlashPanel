// Package bot — inline keyboard wizard + menus (callback flows).
// /menu opens the command deck; /newkey without args opens a location
// picker; quota presets; the same callbacks work from Telegram AND bridge.
package bot

import (
        "fmt"
        "strings"
        "sync/atomic"

        "volt/internal/panel"
        "volt/internal/store"
        "volt/internal/telegram"
)

// Menu renders the main command-deck keyboard.
func Menu() [][]telegram.InlineButton {
        return [][]telegram.InlineButton{
                {{Text: "📊 آمار", Data: "/stats"}, {Text: "🩺 وضعیت", Data: "/status"}},
                {{Text: "🔑 کلیدها", Data: "/keys"}, {Text: "＋ کلید جدید", Data: "/newkey"}},
                {{Text: "📋 گزارش", Data: "/report"}, {Text: "🌍 لوکیشن‌ها", Data: "/ping"}},
                {{Text: "📖 راهنما", Data: "/help"}},
        }
}

// locPicker builds the location picker (top countries + بدون لوکیشن).
func (e *Engine) locPicker() [][]telegram.InlineButton {
        ids := []string{"it", "de", "nl", "tr", "ae", "us", "gb", "fr", "ru", "jp", "sg", "az"}
        var rows [][]telegram.InlineButton
        var row []telegram.InlineButton
        for _, id := range ids {
                row = append(row, telegram.InlineButton{Text: e.locName(id), Data: "nkl:" + id})
                if len(row) == 3 {
                        rows = append(rows, row)
                        row = nil
                }
        }
        if len(row) > 0 {
                rows = append(rows, row)
        }
        rows = append(rows, []telegram.InlineButton{{Text: "🏳️ بدون لوکیشن", Data: "nkl:"}})
        return rows
}

// quotaPicker builds the quota preset picker for a chosen location.
func quotaPicker(loc string) [][]telegram.InlineButton {
        nk := func(label, val string) telegram.InlineButton {
                return telegram.InlineButton{Text: label, Data: "nkq:" + loc + ":" + val}
        }
        return [][]telegram.InlineButton{
                {nk("∞ نامحدود", "0:0"), nk("۳۰ GB", "30:30")},
                {nk("۵۰ GB", "50:30"), nk("۱۰۰ GB", "100:60")},
        }
}

// HandleCallback routes a callback data string (works from Telegram buttons
// and from the bridge terminal). Returns (reply, newKeyboard).
func (e *Engine) HandleCallback(senderID int64, data string) (string, [][]telegram.InlineButton) {
        if strings.HasPrefix(data, "nkl:") {
                loc := strings.TrimPrefix(data, "nkl:")
                name := e.locName(loc)
                if name == "" {
                        name = "بدون لوکیشن"
                }
                return "حجم و اعتبار کلید «" + name + "» را انتخاب کن:", quotaPicker(loc)
        }
        if strings.HasPrefix(data, "nkq:") {
                parts := strings.SplitN(strings.TrimPrefix(data, "nkq:"), ":", 3)
                if len(parts) < 3 {
                        return "خطای داخلی — دوباره امتحان کن", Menu()
                }
                loc, gbS, dS := parts[0], parts[1], parts[2]
                var gb float64
                var days int
                fmt.Sscanf(gbS, "%f", &gb)
                fmt.Sscanf(dS, "%d", &days)
                k, err := e.Panel.CreateKey(panel.NewKeyOpts{Name: autoName(), Loc: loc, QuotaGB: gb, ExpiryDays: days})
                if err != nil {
                        return "❌ ساخت کلید ناموفق: " + err.Error(), Menu()
                }
                e.St.Update(func(s *store.State) { s.KeysCreated++ })
                name := "بدون لوکیشن"
                if k.Loc != "" {
                        name = e.locName(k.Loc)
                }
                return fmt.Sprintf(
                        "✅ <b>کلید ساخته شد</b> — %s\n🆔 <code>%s</code>\n🌍 %s · %s · %s\n\nلینک v2rayNG:\n<code>%s/sub/%s?format=base64&amp;frag=mci</code>",
                        k.Name, k.UUID, name, quotaFa(gb), daysFa(days), e.Cfg.Panel.URL, k.UUID), Menu()
        }
        // plain command callbacks
        return e.Handle(senderID, data), Menu()
}

var nameSeq atomic.Int64

// autoName generates a friendly Persian key name.
func autoName() string {
        n := nameSeq.Add(1)
        return fmt.Sprintf("کلید شمارهٔ %s", FaDigits(fmt.Sprint(n)))
}

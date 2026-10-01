// Package bot — the VOLT Telegram bot engine: command router + handlers.
// One router, two transports: dedicated token (long-poll) + D1 bridge.
package bot

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"volt/internal/cfapi"
	"volt/internal/config"
	"volt/internal/history"
	"volt/internal/panel"
	"volt/internal/store"
	"volt/internal/telegram"
)

// Engine wires everything together.
type Engine struct {
	Cfg     *config.Config
	TG      *telegram.Client
	Panel   *panel.Client
	CF      *cfapi.Client
	St      *store.Store
	Locs    []Loc
	History history.Store
}

// Loc is a location catalog entry (mirrored from the worker).
type Loc struct {
	ID    string   `json:"id"`
	Fa    string   `json:"fa"`
	Flag  string   `json:"flag"`
	City  string   `json:"city"`
	Note  string   `json:"note"`
	Relays int    `json:"relays"`
}

// NewEngine builds the bot engine.
func NewEngine(cfg *config.Config, tg *telegram.Client, p *panel.Client, cf *cfapi.Client, st *store.Store) *Engine {
	return &Engine{Cfg: cfg, TG: tg, Panel: p, CF: cf, St: st}
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// Handle routes one command string; returns the reply text.
// senderID <= 0 → bridge (panel terminal) — admin-only by construction.
func (e *Engine) Handle(senderID int64, text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return "دستور خالی است — /help را بزن."
	}
	e.St.Update(func(s *store.State) { s.CmdCount++ })

	// strip @botname suffixes
	if i := strings.Index(text, "@"); i > 0 {
		text = text[:i]
	}
	fields := strings.Fields(text)
	cmd := strings.ToLower(fields[0])
	args := fields[1:]

	// /admin works for everyone (claim); everything else needs admin
	if cmd == "/admin" {
		return e.cmdAdmin(senderID, args)
	}
	isAdmin := senderID <= 0 || e.St.IsAdmin(senderID)

	switch cmd {
	case "/start":
		return txtStart
	case "/help":
		return txtHelp
	case "/arch", "/volt":
		return txtArch
	}
	if !isAdmin {
		return txtNotAdmin
	}

	switch cmd {
	case "/status":
		return e.cmdStatus()
	case "/stats":
		return e.cmdStats()
	case "/keys":
		return e.cmdKeys()
	case "/newkey":
		return e.cmdNewKey(args)
	case "/delkey":
		return e.cmdDelKey(args)
	case "/renew":
		return e.cmdRenew(args)
	case "/loc":
		return e.cmdLoc(args)
	case "/ipmode":
		return e.cmdIPMode(args)
	case "/sub":
		return e.cmdSub(args)
	case "/report":
		return e.cmdReport()
	case "/ping":
		return e.cmdPing(args)
	case "/menu":
		return e.cmdMenu()
	case "/ask":
		return e.cmdAsk(args)
	case "/trend":
		return e.cmdTrend()
	default:
		if strings.HasPrefix(text, "/") {
			return "دستور ناشناخته — /help را بزن."
		}
		// free text → treat as quick newkey
		return txtNewKeyHow
	}
}

func (e *Engine) cmdAdmin(sender int64, args []string) string {
	if sender > 0 && e.St.IsAdmin(sender) {
		return "✅ تو از قبل مدیر هستی."
	}
	if len(args) < 1 {
		return "کد ادمین را بفرست: <code>/admin کد</code>"
	}
	if strings.TrimSpace(args[0]) != e.Cfg.AdminCode() {
		return "❌ کد نادرست است."
	}
	e.St.AddAdmin(sender)
	return "✅ خوش آمدی مدیر! /help را بزن."
}

func (e *Engine) cmdMenu() string {
	return "🏠 <b>میز فرمان ولت</b> — یک گزینه را انتخاب کن:"
}

func (e *Engine) cmdAsk(args []string) string {
	if len(args) == 0 {
		return AgentHelp()
	}
	q := strings.Join(args, " ")
	if a := Agent(q); a != "" {
		return a
	}
	return "🤖 این را در دانش فعلی‌ام ندارم. این‌ها را می‌دانم:\n\n" + strings.TrimPrefix(AgentHelp(), "🤖 <b>ایجنت ولت</b> — بپرس، جواب بدهم:\n\n")
}

func (e *Engine) cmdTrend() string {
	if e.History == nil {
		return "تاریخچه در این نسخه فعال نیست."
	}
	rows, err := e.History.Since(time.Now().Unix()/3600 - 24)
	if err != nil || len(rows) == 0 {
		return "هنوز داده‌ای ثبت نشده — هر ساعت یک اسنپ‌شات می‌گیرم."
	}
	return history.Trend(rows, 24)
}

func (e *Engine) cmdStatus() string {
	h, err := e.Panel.Health()
	if err != nil {
		return "❌ پنل پاسخ نداد: " + err.Error()
	}
	up := time.Since(time.UnixMilli(e.St.Get().StartedAt)).Round(time.Second)
	return fmt.Sprintf(
		"⚡ <b>وضعیت VOLT</b>\n\n"+
			"🛰 پنل: <b>%s</b> ✓ (نسخهٔ %s)\n"+
			"🧠 هسته: <code>%s</code>\n"+
			"🔋 بک‌اند Go: زنده — آپ‌تایم %s\n"+
			"🌐 آدرس میز فرمان: <code>%s/g/%s</code>",
		h.Name, FaDigits(h.Build), h.Core, FaDigits(up.String()), e.Cfg.Panel.URL, e.Cfg.Panel.Gate)
}

func (e *Engine) cmdStats() string {
	st, set, err := e.Panel.Stats()
	if err != nil {
		return "❌ خطا در گرفتن آمار: " + err.Error()
	}
	ad := "خاموش"
	if set.Adblock == 1 {
		ad = "روشن 🛡"
	}
	ipm := "چرخشی 🔁"
	if set.IPMode == "fixed" {
		ipm = "ثابت 📌"
	}
	return fmt.Sprintf(
		"📊 <b>آمار پنل VOLT</b>\n\n"+
			"🔑 کلیدها: <b>%s</b> (فعال: %s)\n"+
			"🟢 آنلاین (۵ دقیقه): <b>%s</b>\n"+
			"📥 مصرف امروز: <b>%s</b>\n"+
			"📦 مصرف کل: <b>%s</b>\n"+
			"🌍 لوکیشن‌ها: <b>%s</b>\n\n"+
			"🛡 ضدتبلیغ: %s · حالت IP: %s\n"+
			"🏗 نسخهٔ پنل: %s",
		FaDigits(fmt.Sprint(st.Keys)), FaDigits(fmt.Sprint(st.Active)),
		FaDigits(fmt.Sprint(st.Online)), FaBytes(st.TrafficToday), FaBytes(st.LifetimeBytes),
		FaDigits(fmt.Sprint(st.Locations)), ad, ipm, FaDigits(st.Build))
}

func (e *Engine) cmdKeys() string {
	keys, err := e.Panel.ListKeys()
	if err != nil {
		return "❌ خطا: " + err.Error()
	}
	if len(keys) == 0 {
		return "هنوز کلیدی ساخته نشده — با /newkey بساز."
	}
	var b strings.Builder
	b.WriteString("🔑 <b>کلیدهای VOLT</b>\n\n")
	for i, k := range keys {
		if i >= 15 {
			fmt.Fprintf(&b, "… و %s کلید دیگر\n", FaDigits(fmt.Sprint(len(keys)-15)))
			break
		}
		status := "✅"
		if k.Status != "active" || (k.ExpiryMs > 0 && k.ExpiryMs < time.Now().UnixMilli()) {
			status = "⛔"
		}
		loc := "بدون لوکیشن"
		if k.Loc != "" {
			loc = k.Loc
		}
		fmt.Fprintf(&b, "%s <b>%s</b> · %s\n<code>%s</code>\nمصرف: %s\n\n",
			status, k.Name, loc, k.UUID, FaBytes(k.UsedBytes))
	}
	b.WriteString("لینک اشتراک هر کلید: /sub &lt;uuid&gt;")
	return b.String()
}

func (e *Engine) cmdNewKey(args []string) string {
	if len(args) == 0 {
		return "🌍 لوکیشن کلید جدید را انتخاب کن (از دکمه‌های زیر یا <code>/newkey نام لوکیشن حجم روز</code>):"
	}
	name := strings.Join(args[:1], " ")
	loc := ""
	if len(args) >= 2 {
		loc = strings.ToLower(args[1])
		if loc != "" && e.locName(loc) == "" {
			return fmt.Sprintf("❌ لوکیشن «%s» شناخته نشد — /ping برای فهرست کشورها یا خالی بگذار.", loc)
		}
	}
	var gb float64
	var days int
	fmt.Sscanf(strings.Join(args, " "), "%s %s %f %d", new(string), new(string), &gb, &days)
	k, err := e.Panel.CreateKey(panel.NewKeyOpts{Name: name, Loc: loc, QuotaGB: gb, ExpiryDays: days})
	if err != nil {
		return "❌ ساخت کلید ناموفق: " + err.Error()
	}
	e.St.Update(func(s *store.State) { s.KeysCreated++ })
	locFa := "بدون لوکیشن"
	if k.Loc != "" {
		locFa = e.locName(k.Loc)
	}
	return fmt.Sprintf(
		"✅ <b>کلید ساخته شد</b> — %s\n\n"+
			"🆔 <code>%s</code>\n"+
			"🌍 لوکیشن: %s\n"+
			"📦 حجم: %s · اعتبار: %s\n\n"+
			"لینک اشتراک v2rayNG:\n<code>%s/sub/%s?format=base64&amp;frag=mci</code>\n\n"+
			"بقیهٔ فرمت‌ها: /sub %s",
		k.Name, k.UUID, locFa,
		quotaFa(gb), daysFa(days),
		e.Cfg.Panel.URL, k.UUID, k.UUID)
}

func quotaFa(gb float64) string {
	if gb <= 0 {
		return "نامحدود"
	}
	return FaDigits(fmt.Sprintf("%.0f GB", gb))
}
func daysFa(d int) string {
	if d <= 0 {
		return "نامحدود"
	}
	return FaDigits(fmt.Sprintf("%d روز", d))
}

func (e *Engine) cmdDelKey(args []string) string {
	if len(args) < 1 || !uuidRe.MatchString(args[0]) {
		return "شناسهٔ کلید را درست بفرست: <code>/delkey uuid</code>"
	}
	if err := e.Panel.DeleteKey(args[0]); err != nil {
		return "❌ حذف ناموفق: " + err.Error()
	}
	return "🗑 کلید حذف شد."
}

func (e *Engine) cmdRenew(args []string) string {
	if len(args) < 2 || !uuidRe.MatchString(args[0]) {
		return "شکل درست: <code>/renew uuid روز</code>"
	}
	var d int
	fmt.Sscanf(args[1], "%d", &d)
	if d <= 0 {
		return "تعداد روز باید مثبت باشد."
	}
	if _, err := e.Panel.PatchKey(args[0], map[string]any{"add_days": d}); err != nil {
		return "❌ خطا: " + err.Error()
	}
	return fmt.Sprintf("✅ تمدید شد: %s روز دیگر.", FaDigits(fmt.Sprint(d)))
}

func (e *Engine) locName(id string) string {
	for _, l := range e.Locs {
		if l.ID == id {
			return l.Flag + " " + l.Fa
		}
	}
	return ""
}

func (e *Engine) cmdLoc(args []string) string {
	if len(args) < 2 || !uuidRe.MatchString(args[0]) {
		return "شکل درست: <code>/loc uuid کشور</code> (مثل: it / de / tr / خالی = بدون لوکیشن)"
	}
	loc := strings.ToLower(args[1])
	if loc != "" && e.locName(loc) == "" {
		return "❌ این لوکیشن وجود ندارد."
	}
	if _, err := e.Panel.PatchKey(args[0], map[string]any{"loc": loc}); err != nil {
		return "❌ خطا: " + err.Error()
	}
	if loc == "" {
		return "✅ لوکیشن برداشته شد — خروجی پیش‌فرض."
	}
	return "✅ لوکیشن کلید شد: " + e.locName(loc)
}

func (e *Engine) cmdIPMode(args []string) string {
	if len(args) < 2 || !uuidRe.MatchString(args[0]) {
		return "شکل درست: <code>/ipmode uuid fixed|rotate</code>"
	}
	mode := "rotate"
	if strings.HasPrefix(strings.ToLower(args[1]), "f") || args[1] == "ثابت" {
		mode = "fixed"
	}
	if _, err := e.Panel.PatchKey(args[0], map[string]any{"ip_mode": mode}); err != nil {
		return "❌ خطا: " + err.Error()
	}
	if mode == "fixed" {
		return "✅ حالت IP ثابت 📌 — این کاربر همیشه از یک ماشینِ همان رله خارج می‌شود (پایان نوسان IP)."
	}
	return "✅ حالت IP چرخشی 🔁"
}

func (e *Engine) cmdSub(args []string) string {
	if len(args) < 1 || !uuidRe.MatchString(args[0]) {
		return "شناسهٔ کلید را بفرست: <code>/sub uuid</code>"
	}
	base := e.Cfg.Panel.URL + "/sub/" + args[0]
	return fmt.Sprintf(
		"🔗 <b>لینک‌های اشتراک</b>\n\n"+
			"📱 v2rayNG (پیشنهادی — فرگمنت همراه‌اول):\n<code>%s?format=base64&amp;frag=mci</code>\n\n"+
			"🧩 Xray کامل (فرگمنت + بدون Mux):\n<code>%s?format=xjson&amp;frag=mci</code>\n\n"+
			"🎵 sing-box / Hiddify:\n<code>%s?format=singbox</code>\n\n"+
			"🐱 Clash:\n<code>%s?format=clash</code>\n\n"+
			"💡 فرگمنت هر سیم‌کارت: <code>?frag=mci / irancell / rightel</code>",
		base, base, base, base)
}

func (e *Engine) cmdReport() string {
	st, set, err := e.Panel.Stats()
	if err != nil {
		return "❌ خطا در گزارش: " + err.Error()
	}
	keys, _ := e.Panel.ListKeys()
	locUse := map[string]int64{}
	for _, k := range keys {
		if k.Loc != "" {
			locUse[k.Loc] += k.UsedBytes
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "📋 <b>گزارش VOLT</b> — %s\n\n", FaDigits(time.Now().Format("15:04")))
	fmt.Fprintf(&b, "🔑 کلید فعال: %s از %s\n", FaDigits(fmt.Sprint(st.Active)), FaDigits(fmt.Sprint(st.Keys)))
	fmt.Fprintf(&b, "🟢 آنلاین: %s · امروز: %s\n", FaDigits(fmt.Sprint(st.Online)), FaBytes(st.TrafficToday))
	fmt.Fprintf(&b, "📦 کل: %s · ضدتبلیغ: %s\n\n", FaBytes(st.LifetimeBytes), onOff(set.Adblock == 1))
	if len(locUse) > 0 {
		b.WriteString("🌍 مصرف به تفکیک لوکیشن:\n")
		type kv struct {
			k string
			v int64
		}
		var lst []kv
		for k, v := range locUse {
			lst = append(lst, kv{k, v})
		}
		sort.Slice(lst, func(i, j int) bool { return lst[i].v > lst[j].v })
		for i, x := range lst {
			if i >= 5 {
				break
			}
			fmt.Fprintf(&b, "  %s: %s\n", e.locName(x.k), FaBytes(x.v))
		}
	}
	e.St.Update(func(s *store.State) { s.LastReportTS = time.Now().UnixMilli() })
	return b.String()
}

func onOff(b bool) string {
	if b {
		return "روشن"
	}
	return "خاموش"
}

func (e *Engine) cmdPing(args []string) string {
	if len(args) >= 1 && e.locName(strings.ToLower(args[0])) != "" {
		id := strings.ToLower(args[0])
		return fmt.Sprintf("📡 تست رلهٔ %s از پنل: دکمهٔ «تست» در بخش لوکیشن‌های میز فرمان را بزن — نتیجهٔ زنده همان‌جا نمایش داده می‌شود.\n%s", e.locName(id), e.locName(id))
	}
	var b strings.Builder
	b.WriteString("🌍 <b>لوکیشن‌های VOLT</b> — پرمصرف‌ها:\n\n")
	top := []string{"it", "de", "nl", "tr", "ae", "us", "gb", "fr", "ru", "jp", "sg", "az"}
	for _, id := range top {
		if n := e.locName(id); n != "" {
			b.WriteString("• " + n + " — <code>" + id + "</code>\n")
		}
	}
	b.WriteString("\nهمهٔ ۳۳ کشور در میز فرمان ← لوکیشن‌ها.")
	return b.String()
}

// BootstrapAnnounce is sent to the admin when the daemon starts.
func (e *Engine) BootstrapAnnounce() string {
	h, _ := e.Panel.Health()
	return fmt.Sprintf(
		"⚡ <b>بک‌اند Go ولت بالا آمد</b>\n\n"+
			"🔋 پروسه: <code>voltd</code> (Golang — ۷۵٪ معماری VOLT)\n"+
			"🛰 پنل: %s\n🌐 میز فرمان: <code>%s/g/%s</code>\n\n"+
			"ترمینال Go داخل پنل هم فعال است (بخش «ترمینال») — همین دستورها آنجا هم کار می‌کنند.",
		FaDigits(h.Build), e.Cfg.Panel.URL, e.Cfg.Panel.Gate)
}

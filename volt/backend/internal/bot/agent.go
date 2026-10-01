// Package bot — the VOLT Go agent: a rule-based Persian assistant.
// The flash lineage has a cloud-AI /agent; VOLT's first generation answers
// from a native Go knowledge engine (zero API cost, zero latency, offline).
package bot

import (
        "strings"
)

// KBEntry is one knowledge rule.
type KBEntry struct {
        Keywords []string
        Answer   string
}

var kb = []KBEntry{
        {
                Keywords: []string{"فرگمنت", "fragment", "frag"},
                Answer: "💡 <b>فرگمنت چیست؟</b>\n\nفرگمنت یعنی تکه‌تکه کردن دست‌دادن TLS (Handshake) تا فایروال SNI را کامل نخواند. فقط وقتی لازم است که کانفیگ‌ها بدون فیلترشکن وصل نشوند — برای سرعت خام نیازی به آن نیست (فقط چند میلی‌ثانیه به شروع اتصال اضافه می‌کند).\n\n<b>پروفایل هر سیم‌کارت:</b>\n• همراه اول: <code>?frag=mci</code> (۱۰۰-۲۰۰ بایت — پایدارترین)\n• ایرانسل: <code>?frag=irancell</code> (۴۰-۱۰۰ — DPI تهاجمی‌تر)\n• رایتل: <code>?frag=rightel</code> (۱۰-۲۰ — سبک)\n• ثابت: <code>?frag=fixed</code> (۱۰۰-۲۰۰)\n\nپروفایل را به انتهای لینک اشتراک اضافه کن.",
        },
        {
                Keywords: []string{"لوکیشن", "کشور", "location", "loc", "خروجی"},
                Answer: "🌍 <b>لوکیشن‌ها</b>\n\nهر کلید می‌تواند یک کشور خروجی داشته باشد — ترافیک سایت‌های پشت کلودفلر (بیشتر وب) از رلهٔ تأیید‌شدهٔ همان کشور خارج می‌شود؛ سایت‌های غیرکلودفلر (گوگل، تلگرام، نتفلیکس و…) از مسیر مستقیم پرسرعت ورکر می‌روند.\n\n<b>تغییر:</b> <code>/loc uuid کشور</code> (مثل <code>/loc uuid it</code>) یا از میز فرمان ← کلیدها.\n\nنزدیک‌ترین خروجی به ایران: ایتالیا 🇮🇹. برای دانلود: آلمان 🇩🇪 و ایتالیا. برای Gemini: ایتالیا یا آمریکا. فهرست کامل و زنده: میز فرمان ← لوکیشن‌ها.",
        },
        {
                Keywords: []string{"ip ثابت", "ثابت", "پین", "fixed", "نوسان"},
                Answer: "📌 <b>IP ثابت در برابر چرخشی</b>\n\nرله‌ها خانواده‌هایی از ماشین‌ها هستند؛ بدون پین، هر اتصال از ماشین متفاوتی خارج می‌شود (نوسان IP).\n\nحل: <code>/ipmode uuid fixed</code> — با هش پایدار (uuid + رله) همیشه همان ماشین انتخاب می‌شود. تغییر به چرخشی: <code>/ipmode uuid rotate</code>.\n\nبرای سرویس‌هایی که IP ثابت می‌پسندند (Gemini، بعضی بانک‌ها) حالت ثابت را روشن کن.",
        },
        {
                Keywords: []string{"تبلیغ", "adblock", "ضد تبلیغ", "ads"},
                Answer: "🛡 <b>مسدودسازی تبلیغات</b>\n\n۴۸ دامنهٔ تبلیغاتی و ردیاب در سطح هسته مسدود می‌شوند — قبل از هر اتصال بالادست، با هزینهٔ صفر برای ترافیک عادی. یعنی حتی کلاینت‌های بدون قابلیت routing هم تبلیغ نمی‌گیرند.\n\nپیش‌فرض روشن است. خاموش/روشن: تنظیمات میز فرمان یا لینک ساب با <code>?ad=0</code>.\n\n<i>صادقانه: تبلیغ ویدیویی داخل یوتیوب از همان سرورهای ویدیو می‌آید و مسدود کردن شبکه‌ای آن پخش را هم می‌کشد.</i>",
        },
        {
                Keywords: []string{"mux", "مکس", "کند", "سرعت", "speed"},
                Answer: "⚡ <b>سرعت</b>\n\nسه اصل نسل VOLT:\n۱) <b>بدون Mux</b> — همهٔ کانفیگ‌ها mux خاموش دارند (مزاحم صف‌بندی است)\n۲) <b>0-RTT</b> — اولین بسته‌های داده همراه هندشیک می‌روند (<code>?ed=2560</code>)\n۳) <b>ضربان ۲۵ ثانیه</b> — اتصال بیکار دیگر توسط لبه کشته نمی‌شود (پایان چرخهٔ «درحال اتصال» تلگرام)\n\nاگر جایی کند بود: اول فرگمنت را خاموش کن، بعد لوکیشن نزدیک‌تر را امتحان کن.",
        },
        {
                Keywords: []string{"go", "گولنگ", "معماری", "golang"},
                Answer: "🔋 <b>معماری VOLT</b>\n\n• <b>Go (بک‌اند و ربات)</b> — همین گفتگو، مدیریت کلیدها، پل تلگرام، ابزار دیپلوی (voltctl)، خزانهٔ رمزنگاری، مانیتور — همه یک باینری: <code>voltd</code>\n• <b>TypeScript (لبه)</b> — تونل VLESS، اشتراک‌ها و API روی ورکر کلادفلر (۲۰٪)\n• <b>Tailwind (ظاهر)</b> — رابط میز فرمان (۵٪)\n\nیعنی: هر چیزی که «فکر» می‌کند Go است؛ لبه فقط «رله» است.",
        },
        {
                Keywords: []string{"ساب", "اشتراک", "sub", "لینک", "v2ray"},
                Answer: "🔗 <b>لینک‌های اشتراک</b>\n\nهر کلید یک لینک پایه دارد: <code>…/sub/uuid</code>\n\nفرمت‌ها: <code>?format=base64</code> (v2rayNG) · <code>?format=xjson</code> (کانفیگ کامل Xray با فرگمنت) · <code>?format=singbox</code> (Hiddify — بدون domain_strategy) · <code>?format=clash</code>\n\nگزینه‌ها: <code>?frag=سیم‌کارت</code> · <code>?ipm=fixed</code> · <code>?ad=0</code>\n\nاز ربات: <code>/sub uuid</code>",
        },
        {
                Keywords: []string{"کد ادمین", "ادمین", "admin"},
                Answer: "🔑 <b>ادمین</b>\n\nاولین نفر که <code>/admin کد</code> را بفرستد مالک ربات می‌شود. کد در فایل <code>volt/.admin-code</code> است (برای مدیر).\n\nدستورهای مدیریتی: /newkey · /keys · /stats · /report · /status — همه از ترمینال میز فرمان هم در دسترس‌اند.",
        },
}

// Agent answers a free-text question from the knowledge base.
// Returns "" when nothing matches.
func Agent(q string) string {
        s := strings.ToLower(strings.TrimSpace(q))
        if s == "" {
                return ""
        }
        best := -1
        bestScore := 0
        for i, e := range kb {
                score := 0
                for _, k := range e.Keywords {
                        if strings.Contains(s, strings.ToLower(k)) {
                                score++
                        }
                }
                if score > bestScore {
                        bestScore = score
                        best = i
                }
        }
        if best < 0 || bestScore == 0 {
                return ""
        }
        return kb[best].Answer
}

// AgentHelp lists what the agent knows.
func AgentHelp() string {
        var b strings.Builder
        b.WriteString("🤖 <b>ایجنت ولت</b> — بپرس، جواب بدهم:\n\n")
        for i, e := range kb {
                if i >= 8 {
                        break
                }
                b.WriteString("• " + e.Keywords[0] + "\n")
        }
        b.WriteString("\nمثال: <code>/ask فرگمنت چیست</code>")
        return b.String()
}

// Package bot — Persian texts (قانون ۷: زبان فارسی، اعداد فارسی، محتوای عمیق).
package bot

import (
	"volt/internal/fa"
)

// FaDigits converts ASCII digits to Persian digits (delegates to internal/fa).
func FaDigits(s string) string { return fa.Digits(s) }

// FaBytes renders bytes in a human Persian form (delegates to internal/fa).
func FaBytes(n int64) string { return fa.Bytes(n) }

const txtStart = `⚡ <b>ولت VOLT — ربات نسل جدید</b>

سلام! من ربات پنل <b>VOLT</b> هستم — بک‌اند من صددرصد با <b>Go</b> نوشته شده و لایهٔ لبه با TypeScript روی کلادفلر کار می‌کند.

<b>چه کارهایی می‌کنم؟</b>
• ساخت و مدیریت کلیدهای VPN (لوکیشن، حجم، اعتبار)
• لینک اشتراک در همهٔ فرمت‌ها (v2rayNG · Xray · sing-box · Clash)
• گزارش زندهٔ مصرف و وضعیت پنل
• تست رله‌های هر کشور

برای شروع /help را بزن یا از دکمه‌های زیر استفاده کن ⚡`

const txtHelp = `📖 <b>راهنمای ربات ولت</b>

<b>مدیریت کلید:</b>
/newkey &lt;نام&gt; [لوکیشن] [حجم GB] [روز] — ساخت کلید — مثال:
<code>/newkey گوشی‌من de 50 30</code>
/keys — فهرست کلیدها
/sub &lt;uuid&gt; — لینک اشتراک یک کلید
/loc &lt;uuid&gt; &lt;کشور&gt; — تغییر لوکیشن (مثل: it / de / tr)
/ipmode &lt;uuid&gt; fixed|rotate — IP ثابت یا چرخشی
/renew &lt;uuid&gt; &lt;روز&gt; — تمدید
/delkey &lt;uuid&gt; — حذف

<b>وضعیت و گزارش:</b>
/status — سلامت پنل و بک‌اند
/stats — آمار مصرف
/report — گزارش کامل روزانه
/ping &lt;کشور&gt; — تست رله

<b>مدیریت:</b>
/admin &lt;کد&gt; — ادمین شدن

<b>دربارهٔ معماری:</b>
۷۵٪ Go (بک‌اند و همین ربات) · ۲۰٪ TypeScript (ورکر لبه) · ۵٪ Tailwind CSS (ظاهر پنل) — هیچ خط جاوااسکریپتی در بک‌اند وجود ندارد.`

const txtNotAdmin = "⛔ این دستور فقط برای مدیر است."

const txtNewKeyHow = `💡 <b>ساخت کلید:</b>\n<code>/newkey نام لوکیشن حجم روز</code>\nمثال: <code>/newkey گوشی‌من de 50 30</code>\n(لوکیشن/حجم/روز اختیاری‌اند — خالی = بدون لوکیشن، نامحدود)`

const txtArch = `⚡ <b>VOLT — معماری نسل جدید</b>

🔋 <b>۷۵٪ Go</b> — بک‌اند و ربات: مدیریت کلیدها، پل تلگرام، مشتری API کلادفلر، نظارت و اعلان‌ها. باینری voltd با حافظهٔ کم و اجرای پیوسته.

🌐 <b>۲۰٪ TypeScript</b> — ورکر لبه: تونل VLESS با 0-RTT، موتور رله و پین IP، تولید اشتراک در ۴ فرمت، API پنل.

🎨 <b>۵٪ Tailwind CSS</b> — ظاهر پنل: طراحی گرافیت + ولت، کاملاً متفاوت از نسل قبل.

📊 همین حالا /stats را امتحان کن.`

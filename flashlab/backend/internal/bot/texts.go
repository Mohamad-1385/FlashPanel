// Package bot — Persian texts (قانون ۷: زبان فارسی، اعداد فارسی، محتوای عمیق).
package bot

import (
        "flashlab/internal/fa"
)

// FaDigits converts ASCII digits to Persian digits (delegates to internal/fa).
func FaDigits(s string) string { return fa.Digits(s) }

// FaBytes renders bytes in a human Persian form (delegates to internal/fa).
func FaBytes(n int64) string { return fa.Bytes(n) }

const txtStart = `⚡ <b>فلش FLASHLAB — ربات نسل جدید</b>

سلام! من ربات پنل <b>FLASHLAB</b> هستم — بک‌اند من صددرصد با <b>Go</b> نوشته شده و لایهٔ لبه با TypeScript روی کلادفلر کار می‌کند.

<b>چه کارهایی می‌کنم؟</b>
• ساخت و مدیریت کلیدهای VPN (لوکیشن، حجم، اعتبار)
• لینک اشتراک در همهٔ فرمت‌ها (v2rayNG · Xray · sing-box · Clash)
• رادار رله‌ها — اسکن همزمان همهٔ کشورها با Go
• تست سرعت واقعی از دل تونل (۵ مگابایت دانلود)
• توربو — انتخاب خودکار سریع‌ترین رله بر اساس رادار
• گزارش زندهٔ مصرف و وضعیت پنل

برای شروع /help را بزن یا از دکمه‌های زیر استفاده کن ⚡`

const txtHelp = `📖 <b>راهنمای ربات فلش</b>

<b>مدیریت کلید:</b>
/newkey &lt;نام&gt; [لوکیشن] [حجم GB] [روز] — ساخت کلید — مثال:
<code>/newkey گوشی‌من de 50 30</code>
/keys — فهرست کلیدها
/sub &lt;uuid&gt; — لینک اشتراک یک کلید
/loc &lt;uuid&gt; &lt;کشور&gt; — تغییر لوکیشن (مثل: it / de / tr)
/ipmode &lt;uuid&gt; fixed|rotate — IP ثابت یا چرخشی
/turbo &lt;uuid&gt; on|off — رله‌های سریع‌ترین‌اول (رادار)
/renew &lt;uuid&gt; &lt;روز&gt; — تمدید
/delkey &lt;uuid&gt; — حذف

<b>قدرت Go:</b>
/radar [live] — اسکن همزمان رله‌های همهٔ کشورها
/best — ۵ رلهٔ سریع تأییدشده
/speed &lt;uuid&gt; — تست دانلود واقعی از دل تونل

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

const txtArch = `⚡ <b>FLASHLAB — معماری نسل جدید</b>

🔋 <b>۷۵٪ Go</b> — بک‌اند و ربات: مدیریت کلیدها، پل تلگرام، مشتری API کلادفلر، نظارت و اعلان‌ها، <b>رادار همزمان رله‌ها</b> و تست سرعت واقعی. باینری flashd با حافظهٔ کم و اجرای پیوسته.

🌐 <b>۲۰٪ TypeScript</b> — ورکر لبه: تونل VLESS با 0-RTT، موتور رله و پین IP، تولید اشتراک در ۴ فرمت با فرگمنت سیم‌کارت، API پنل.

🎨 <b>۵٪ Tailwind CSS</b> — ظاهر پنل: طراحی فلش‌لب با سرمه‌ای و کهربایی، انیمیشن‌های زنده و رادار تعاملی.

📊 همین حالا /radar را امتحان کن.`

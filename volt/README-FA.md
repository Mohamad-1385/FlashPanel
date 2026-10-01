# ⚡ VOLT — پنل فلش نسل Go

پنل VLESS نسل جدید — معماری سه‌لایه با سهم‌های واقعی:

| لایه | زبان | سهم | مسیر |
|------|------|-----|------|
| بک‌اند + ربات + ابزار | **Go** | ~۷۳٪ | `backend/` |
| ورکر لبه (تونل + ساب + API) | **TypeScript** | ~۲۱٪ | `worker/` |
| ظاهر میز فرمان | **Tailwind CSS** | ~۶٪ | `ui/` + `worker/src/ui.ts` |

## معماری

```
[کاربر] ──TLS/WS──▶ [ورکر TS] ──رلهٔ کشور──▶ [اینترنت]
                       │ D1 (کلیدها/تنظیمات/بریج)
                       ▼
                  [دیمن Go: voltd] ──▶ تلگرام (مدیر)
                       ▲
              [ترمینال پنل / voltctl]
```

- **voltd** (Go): ربات تلگرام + بریج D1 + مانیتور سلامت + تاریخچهٔ ساعتی + خزانهٔ AES-GCM
- **voltctl** (Go): `deploy` · `push` · `verify` (کلاینت VLESS بومی Go) · `status` · `report` · `vault`
- **ورکر** (TS): تونل VLESS با 0-RTT و UDP-DNS، پین IP ثابت، ضدتبلیغ هسته‌ای، اشتراک در base64/xjson/singbox/clash
- **میز فرمان** (Tailwind): گرافیت + ولت الکتریکی — بدون دراور و سایدبار، نوار فرمان بالا + بنتو

## ساخت

```bash
node scripts/build.js          # tsc (strict) → esbuild → Tailwind درون‌سازی
cd backend && go build ./...   # Go 1.24
go test ./...                  # ۸ پکیج تست
./bin/voltctl deploy           # دیپلوی کامل از Go
./bin/voltctl verify           # تست E2E زنده
```

## درس‌های پورت‌شده از نسل قبل (7.9.x)

- سینگ‌باکس بدون `domain_strategy` (ریشهٔ باگ Hiddify 7.9.29)
- `interrupt_exist_connections: false` در urltest
- ضربان WS ۲۵ ثانیه‌ای (پایان «درحال اتصال» تلگرام)
- Mux خاموش + 0-RTT همه‌جا
- DNS زنجیره‌ای: DoH (RFC 8484) → TCP 8.8.4.4
- پین IP ثابت با مین-هش سازگار (uid × رله)

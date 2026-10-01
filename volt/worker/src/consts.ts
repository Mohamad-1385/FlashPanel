// VOLT worker — constants: locations (verified relays ported from the live
// FLASH CORE catalog), ad-block list, ports, frag profiles, version.
import type { LocCountry } from "./types";

export const VERSION = "1.0.1";
export const CODENAME = "تپش";   // «ضربان زنده» — location relays came alive
export const BUILD = `VOLT ${VERSION} «${CODENAME}»`;
export const CORE_ID = "VOLT-GO/1.0";          // Go-powered generation
export const SESSION_TTL = 12 * 3600 * 1000;
export const DNS_HOST = "8.8.4.4";   // 1.1.1.1 is a Cloudflare IP — workers can't connect() to CF

// tunnel ports (CF TLS + plain) — links are generated for these
export const TLS_PORTS = [443, 8443, 2053, 2087];
export const PLAIN_PORTS = [80];

// fragment profiles per operator (ported from 7.9.29 «جهان‌گیر»)
export const FRAG_PROFILES: Record<string, { l: string; label: string }> = {
  mci: { l: "100-200", label: "همراه اول (پایدارترین)" },
  irancell: { l: "40-100", label: "ایرانسل" },
  rightel: { l: "10-20", label: "رایتل (سبک)" },
  fixed: { l: "100-200", label: "ثابت" },
};

// Cloudflare IPv4 ranges — a worker's connect() can NEVER reach these
// (CF blocks worker→CF); every CF-hosted target must ride a relay.
export const CF_RANGES: string[] = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];

// provably NON-Cloudflare giants (own CDNs) — skip the DoH roundtrip for them
// (YouTube chunk hosts are fresh random subdomains: the cache never hits —
// every new stream would pay a full DNS lookup before the dial otherwise)
export const DOH_SKIP_SUFFIXES: string[] = [
  "google.com", "googlevideo.com", "youtube.com", "youtube-nocookie.com",
  "ytimg.com", "ggpht.com", "gstatic.com", "googleapis.com",
  "googleusercontent.com", "gvt1.com", "gvt2.com", "withgoogle.com",
  "microsoft.com", "live.com", "office.com", "office365.com", "msn.com", "bing.com",
  "apple.com", "icloud.com", "mzstatic.com",
  "netflix.com", "nflxvideo.net", "nflximg.net", "nflxext.com",
  "facebook.com", "fbcdn.net", "instagram.com", "cdninstagram.com",
  "tiktok.com", "tiktokcdn.com", "tiktokv.com", "ttwstatic.com",
  "telegram.org", "t.me", "telesco.pe",
  "twitter.com", "x.com", "twimg.com", "t.co",
  "amazon.com", "amazonaws.com", "cloudfront.net", "media-amazon.com",
  "spotify.com", "scdn.co", "spotifycdn.com",
  "discord.com", "discordapp.com", "discord.gg", "discord.media",
  "reddit.com", "redd.it", "redditstatic.com",
  "pinterest.com", "pinimg.com",
  "steamcontent.com", "steamserver.net", "steampowered.com", "steamstatic.com",
];

// verified dual-port (80+443) relays — the last-resort bridge for CF-hosted
// port-80 targets when the proxyip pool can't forward plain HTTP (measured:
// most community pools are TLS/SNI-only on 443)
export const PORT80_FALLBACK: string[] = ["179.255.190.4", "179.255.190.3", "179.255.190.5"];

// ad & tracker suffixes (curated — googlevideo untouched: in-stream ads ride
// the same servers as the video itself)
export const AD_BLOCK_SUFFIXES: string[] = [
  "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
  "google-analytics.com", "googletagmanager.com", "googletagservices.com", "admob.com",
  "app-measurement.com", "firebaseinstallations.googleapis.com", "analytics.google.com",
  "scorecardresearch.com", "quantserve.com", "chartbeat.com", "chartbeat.net", "moatads.com",
  "adsrvr.org", "pubmatic.com", "rubiconproject.com", "openx.net", "criteo.com", "criteo.net",
  "casalemedia.com", "adform.net", "smartadserver.com", "taboola.com", "outbrain.com",
  "z.moatads.com", "amazon-adsystem.com", "adnxs.com", "advertising.com", "adition.com",
  "revcontent.com", "mgid.com", "zedo.com", "popads.net", "springserve.com", "adswizz.com",
  "spotxchange.com", "improvedigital.com", "indexexchange.com", "adtech.com",
  "2mdn.net", "media.net", "yieldmo.com", "servebom.com", "adtech.de",
  "yektanet.com", "sabavision.com", "anetwork.ir", "adro.co",
];

// locations — LIVE-VERIFIED exit relays (tunnel-matrix tested through the
// worker: cp.cloudflare.com 443 must answer). v1.0.1 «تپش» purge:
//   REMOVED 14 dead entries — tr/ae/gr/cy/es/at/ro/rs/az/am/ge/kz (their
//   proxyip.<cc>.workers.dev relays are Cloudflare-hosted: a worker can never
//   connect() to them — 100% dead tunnels) + tw/nl (pools dead through the
//   worker). Community pools are SNI-pass-throughs: they carry CF-hosted TLS
//   traffic of that country; non-CF sites go via the worker's own fast egress.
//   Candidates lv/md/me/th ship pending their live verification tick.
export const LOCATIONS: LocCountry[] = [
  { id: "it", fa: "ایتالیا", en: "Italy", flag: "🇮🇹", cont: "eu", city: "میلان / رم", relays: ["179.255.190.4", "179.255.190.3", "179.255.190.5"], note: "نزدیک‌ترین خروجی به ایران — هر دو پورت", p80: true },
  { id: "de", fa: "آلمان", en: "Germany", flag: "🇩🇪", cont: "eu", city: "فرانکفورت", relays: ["proxyip.de.cmliussss.net"], note: "پینگ پایین اروپا، دانلود و استریم" },
  { id: "us", fa: "آمریکا", en: "United States", flag: "🇺🇸", cont: "am", city: "چند شهر", relays: ["proxyip.us.fxxk.dedyn.io", "proxyip.us.cmliussss.net"], note: "سرویس‌های آمریکایی و Gemini" },
  { id: "gb", fa: "انگلیس", en: "United Kingdom", flag: "🇬🇧", cont: "eu", city: "لندن", relays: ["proxyip.gb.cmliussss.net"], note: "Gemini و سرویس‌های انگلیسی" },
  { id: "fr", fa: "فرانسه", en: "France", flag: "🇫🇷", cont: "eu", city: "پاریس", relays: ["proxyip.fr.cmliussss.net"], note: "رله پایدار و تست‌شده" },
  { id: "ch", fa: "سوئیس", en: "Switzerland", flag: "🇨🇭", cont: "eu", city: "زوریخ", relays: ["proxyip.ch.cmliussss.net"], note: "مناسب حریم خصوصی" },
  { id: "se", fa: "سوئد", en: "Sweden", flag: "🇸🇪", cont: "eu", city: "استکهلم", relays: ["proxyip.se.cmliussss.net"], note: "اسکاندیناوی — هر دو پورت" },
  { id: "fi", fa: "فنلاند", en: "Finland", flag: "🇫🇮", cont: "eu", city: "هلسینکی", relays: ["proxyip.fi.cmliussss.net"], note: "نوردیک کم‌ترافیک — هر دو پورت" },
  { id: "pl", fa: "لهستان", en: "Poland", flag: "🇵🇱", cont: "eu", city: "ورشو", relays: ["proxyip.pl.cmliussss.net"], note: "گیت‌وی اروپای شرقی" },
  { id: "cz", fa: "چک", en: "Czechia", flag: "🇨🇿", cont: "eu", city: "پراگ", relays: ["46.8.218.100"], note: "رله اختصاصی اروپای مرکزی" },
  { id: "lu", fa: "لوکزامبورگ", en: "Luxembourg", flag: "🇱🇺", cont: "eu", city: "بیسن", relays: ["107.189.30.77"], note: "رله اختصاصی و کم‌ترافیک" },
  { id: "ru", fa: "روسیه", en: "Russia", flag: "🇷🇺", cont: "eu", city: "مسکو", relays: ["proxyip.ru.cmliussss.net"], note: "سرویس‌های روسی و گیم" },
  { id: "in", fa: "هند", en: "India", flag: "🇮🇳", cont: "asia", city: "بمبئی", relays: ["proxyip.in.cmliussss.net"], note: "خروجی نزدیک — هر دو پورت" },
  { id: "sg", fa: "سنگاپور", en: "Singapore", flag: "🇸🇬", cont: "asia", city: "سنگاپور", relays: ["140.245.127.48", "166.108.238.41"], note: "۲ رله اختصاصی، هاب پرسرعت آسیا" },
  { id: "hk", fa: "هنگ‌کنگ", en: "Hong Kong", flag: "🇭🇰", cont: "asia", city: "هنگ‌کنگ", relays: ["proxyip.hk.fxxk.dedyn.io", "45.202.248.172", "proxyip.hk.cmliussss.net"], note: "خروجی آسیای شرقی" },
  { id: "jp", fa: "ژاپن", en: "Japan", flag: "🇯🇵", cont: "asia", city: "توکیو", relays: ["proxyip.jp.cmliussss.net", "proxyip.jp.fxxk.dedyn.io"], note: "گیم و سرویس‌های ژاپنی — هر دو پورت" },
  { id: "kr", fa: "کره جنوبی", en: "South Korea", flag: "🇰🇷", cont: "asia", city: "سئول", relays: ["proxyip.kr.cmliussss.net", "proxyip.kr.fxxk.dedyn.io"], note: "مناسب گیم" },
  { id: "ca", fa: "کانادا", en: "Canada", flag: "🇨🇦", cont: "am", city: "تورنتو", relays: ["proxyip.ca.cmliussss.net"], note: "آمریکای شمالی" },
  { id: "br", fa: "برزیل", en: "Brazil", flag: "🇧🇷", cont: "am", city: "سائوپائولو", relays: ["38.180.78.255", "38.180.79.9"], note: "آمریکای جنوبی — هر دو پورت", p80: true },
  { id: "au", fa: "استرالیا", en: "Australia", flag: "🇦🇺", cont: "oc", city: "سیدنی", relays: ["proxyip.au.cmliussss.net"], note: "اقیانوسیه" },
  { id: "lv", fa: "لتونی", en: "Latvia", flag: "🇱🇻", cont: "eu", city: "ریگا", relays: ["proxyip.lv.cmliussss.net"], note: "اروپای شمالی" },
  { id: "md", fa: "مولداوی", en: "Moldova", flag: "🇲🇩", cont: "eu", city: "کیشیناو", relays: ["94.103.0.67"], note: "اروپای شرقی" },
  { id: "me", fa: "مونته‌نگرو", en: "Montenegro", flag: "🇲🇪", cont: "eu", city: "پودگوریتسا", relays: ["147.90.229.163"], note: "بالکان" },
  { id: "th", fa: "تایلند", en: "Thailand", flag: "🇹🇭", cont: "asia", city: "بانکوک", relays: ["38.244.150.113"], note: "آسیای شرقی" },
];

export const DEFAULT_PROXYIP = "proxyip.us.fxxk.dedyn.io";

export function locById(id: string): LocCountry | null {
  return LOCATIONS.find((c) => c.id === id) || null;
}
export function isIpV4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}
export function hostInAdList(host: string): boolean {
  const h = host.toLowerCase();
  return AD_BLOCK_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}
// workers cannot connect() to Cloudflare-fronted hosts — they need a relay.
// Suffix FAST-PATH only; the general detection is DoH + CF ranges (dial.ts
// isCfTarget) — this list can never cover every CF zone (v1.0.0's gap:
// cp.cloudflare.com — the v2rayNG ping URL — wasn't in it and died direct).
export function isCfHosted(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith(".workers.dev") || h.endsWith(".pages.dev")) return true;
  if (h.endsWith(".workers.cloudflare.com") || h === "workers.dev") return true;
  if (/(^|\.)(cloudflare\.com|cloudflare-dns\.com|cloudflareinsights\.com|cloudflarestream\.com|cloudflaressl\.com|trycloudflare\.com|cf\.vc\.cn|ip\.cdt\.one)$/.test(h)) return true;
  return false;
}
export function dohSkip(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return false;
  return DOH_SKIP_SUFFIXES.some((s) => h === s || h.endsWith("." + s));
}
// telegram DC ranges (MTProto must never ride a relay)
export function isTgDcIp(host: string): boolean {
  return /^149\.15[4-9]\./.test(host) || /^91\.10[5-8]\./.test(host) || /^185\.7[6-9]\./.test(host);
}

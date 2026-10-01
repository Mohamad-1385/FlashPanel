// VOLT worker — constants: locations (verified relays ported from the live
// FLASH CORE catalog), ad-block list, ports, frag profiles, version.
import type { LocCountry } from "./types";

export const VERSION = "1.0.0";
export const CODENAME = "جرقه";
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

// locations — verified exit relays (ported from the live catalog)
export const LOCATIONS: LocCountry[] = [
  { id: "it", fa: "ایتالیا", en: "Italy", flag: "🇮🇹", cont: "eu", city: "میلان / رم", relays: ["179.255.190.4", "179.255.190.3", "179.255.190.5"], note: "استریم و دانلود + جمنای" },
  { id: "de", fa: "آلمان", en: "Germany", flag: "🇩🇪", cont: "eu", city: "فرانکفورت", relays: ["proxyip.de.cmliussss.net"], note: "پینگ پایین اروپا، دانلود و استریم" },
  { id: "nl", fa: "هلند", en: "Netherlands", flag: "🇳🇱", cont: "eu", city: "آمستردام", relays: ["2.27.169.118", "178.253.23.53", "proxyip.nl.cmliussss.net"], note: "۲ رله اختصاصی + استخر کمونیتی" },
  { id: "tr", fa: "ترکیه", en: "Turkey", flag: "🇹🇷", cont: "me", city: "استانبول", relays: ["proxyip.tr.workers.dev"], note: "نزدیک‌ترین خروجی به ایران — پینگ عالی" },
  { id: "ae", fa: "امارات", en: "UAE", flag: "🇦🇪", cont: "me", city: "دبی", relays: ["proxyip.ae.workers.dev"], note: "هاب خاورمیانه — نزدیک ایران" },
  { id: "us", fa: "آمریکا", en: "United States", flag: "🇺🇸", cont: "am", city: "چند شهر", relays: ["proxyip.us.fxxk.dedyn.io", "proxyip.us.cmliussss.net"], note: "سرویس‌های آمریکایی و Gemini" },
  { id: "gb", fa: "انگلیس", en: "United Kingdom", flag: "🇬🇧", cont: "eu", city: "لندن", relays: ["proxyip.gb.cmliussss.net"], note: "Gemini و سرویس‌های انگلیسی" },
  { id: "fr", fa: "فرانسه", en: "France", flag: "🇫🇷", cont: "eu", city: "پاریس", relays: ["proxyip.fr.cmliussss.net"], note: "رله پایدار و تست‌شده" },
  { id: "ch", fa: "سوئیس", en: "Switzerland", flag: "🇨🇭", cont: "eu", city: "زوریخ", relays: ["proxyip.ch.cmliussss.net"], note: "مناسب حریم خصوصی" },
  { id: "se", fa: "سوئد", en: "Sweden", flag: "🇸🇪", cont: "eu", city: "استکهلم", relays: ["proxyip.se.cmliussss.net"], note: "اسکاندیناوی، پایدار" },
  { id: "fi", fa: "فنلاند", en: "Finland", flag: "🇫🇮", cont: "eu", city: "هلسینکی", relays: ["proxyip.fi.cmliussss.net"], note: "نوردیک کم‌ترافیک" },
  { id: "pl", fa: "لهستان", en: "Poland", flag: "🇵🇱", cont: "eu", city: "ورشو", relays: ["proxyip.pl.cmliussss.net"], note: "گیت‌وی اروپای شرقی" },
  { id: "cz", fa: "چک", en: "Czechia", flag: "🇨🇿", cont: "eu", city: "پراگ", relays: ["46.8.218.100"], note: "رله اختصاصی اروپای مرکزی" },
  { id: "lu", fa: "لوکزامبورگ", en: "Luxembourg", flag: "🇱🇺", cont: "eu", city: "بیسن", relays: ["107.189.30.77"], note: "رله اختصاصی و کم‌ترافیک" },
  { id: "ru", fa: "روسیه", en: "Russia", flag: "🇷🇺", cont: "eu", city: "مسکو", relays: ["proxyip.ru.cmliussss.net"], note: "سرویس‌های روسی و گیم" },
  { id: "gr", fa: "یونان", en: "Greece", flag: "🇬🇷", cont: "eu", city: "آتن", relays: ["proxyip.gr.workers.dev"], note: "نزدیک‌ترین نقطهٔ اروپا به ایران" },
  { id: "cy", fa: "قبرس", en: "Cyprus", flag: "🇨🇾", cont: "eu", city: "نیکوزیا", relays: ["proxyip.cy.workers.dev"], note: "مدیترانه — پینگ خوب از ایران" },
  { id: "es", fa: "اسپانیا", en: "Spain", flag: "🇪🇸", cont: "eu", city: "مادرید", relays: ["proxyip.es.workers.dev"], note: "جنوب اروپا" },
  { id: "at", fa: "اتریش", en: "Austria", flag: "🇦🇹", cont: "eu", city: "وین", relays: ["proxyip.at.workers.dev"], note: "اروپای مرکزی — پایدار" },
  { id: "ro", fa: "رومانی", en: "Romania", flag: "🇷🇴", cont: "eu", city: "بخارست", relays: ["proxyip.ro.workers.dev"], note: "اروپای شرقی — سرعت خوب" },
  { id: "rs", fa: "صربستان", en: "Serbia", flag: "🇷🇸", cont: "eu", city: "بلگراد", relays: ["proxyip.rs.workers.dev"], note: "بالکان" },
  { id: "az", fa: "آذربایجان", en: "Azerbaijan", flag: "🇦🇿", cont: "asia", city: "باکو", relays: ["proxyip.az.workers.dev"], note: "همسایهٔ شمالی — پینگ بسیار کم" },
  { id: "am", fa: "ارمنستان", en: "Armenia", flag: "🇦🇲", cont: "asia", city: "ایروان", relays: ["proxyip.am.workers.dev"], note: "همسایه — نزدیک‌ترین خروجی" },
  { id: "ge", fa: "گرجستان", en: "Georgia", flag: "🇬🇪", cont: "asia", city: "تفلیس", relays: ["proxyip.ge.workers.dev"], note: "قفقاز — مسیر شمال" },
  { id: "kz", fa: "قزاقستان", en: "Kazakhstan", flag: "🇰🇿", cont: "asia", city: "آلماتی", relays: ["proxyip.kz.workers.dev"], note: "آسیای میانه — نزدیک خزر" },
  { id: "in", fa: "هند", en: "India", flag: "🇮🇳", cont: "asia", city: "بمبئی", relays: ["proxyip.in.cmliussss.net"], note: "خروجی نزدیک" },
  { id: "sg", fa: "سنگاپور", en: "Singapore", flag: "🇸🇬", cont: "asia", city: "سنگاپور", relays: ["140.245.127.48", "166.108.238.41"], note: "۲ رله اختصاصی، هاب پرسرعت آسیا" },
  { id: "hk", fa: "هنگ‌کنگ", en: "Hong Kong", flag: "🇭🇰", cont: "asia", city: "هنگ‌کنگ", relays: ["proxyip.hk.fxxk.dedyn.io", "45.202.248.172", "proxyip.hk.cmliussss.net"], note: "خروجی آسیای شرقی" },
  { id: "jp", fa: "ژاپن", en: "Japan", flag: "🇯🇵", cont: "asia", city: "توکیو", relays: ["proxyip.jp.cmliussss.net", "proxyip.jp.fxxk.dedyn.io"], note: "گیم و سرویس‌های ژاپنی" },
  { id: "kr", fa: "کره جنوبی", en: "South Korea", flag: "🇰🇷", cont: "asia", city: "سئول", relays: ["proxyip.kr.cmliussss.net", "proxyip.kr.fxxk.dedyn.io"], note: "مناسب گیم" },
  { id: "tw", fa: "تایوان", en: "Taiwan", flag: "🇹🇼", cont: "asia", city: "تایپه", relays: ["proxyip.tw.cmliussss.net"], note: "آسیای شرقی" },
  { id: "ca", fa: "کانادا", en: "Canada", flag: "🇨🇦", cont: "am", city: "تورنتو", relays: ["proxyip.ca.cmliussss.net"], note: "آمریکای شمالی" },
  { id: "br", fa: "برزیل", en: "Brazil", flag: "🇧🇷", cont: "am", city: "سائوپائولو", relays: ["38.180.78.255", "38.180.79.9"], note: "آمریکای جنوبی" },
  { id: "au", fa: "استرالیا", en: "Australia", flag: "🇦🇺", cont: "oc", city: "سیدنی", relays: ["proxyip.au.cmliussss.net"], note: "اقیانوسیه" },
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
// workers cannot connect() to Cloudflare-fronted hosts — they need a relay
export function isCfHosted(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith(".workers.dev") || h.endsWith(".pages.dev")) return true;
  if (h.endsWith(".workers.cloudflare.com") || h === "workers.dev") return true;
  // cloudflare zones commonly fronted on CF edge (community list)
  if (/(^|\.)(trycloudflare\.com|cf\.vc\.cn|ip\.cdt\.one)$/.test(h)) return true;
  return false;
}
// telegram DC ranges (MTProto must never ride a relay)
export function isTgDcIp(host: string): boolean {
  return /^149\.15[4-9]\./.test(host) || /^91\.10[5-8]\./.test(host) || /^185\.7[6-9]\./.test(host);
}

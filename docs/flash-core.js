#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
//  ⚡ FLASH CORE v2.0 — هستهٔ واحد سوپر-مگا (P198)
//  ادغام کامل با موتور مگا سرعت پنل — همان فلسفهٔ کانفیگ‌های معمولی:
//   • اسکن زندهٔ اندپوینت + رتبه‌بندی RTT (موتور سوپر مگا سرعت)
//   • هر ساخت = اسکن تازه (فرمان مالک P197)
//   • وارپ و اتر کاملاً جدا (فرمان مالک P198):
//       - وارپ = فرمت‌های WireGuard / AmneziaWG / Direct (.conf برای اپ WG Tunnel)
//       - اتر  = لینک‌های aether:// (ArasClient / Nova)
//   • تعداد دقیق: همیشه دقیقاً همان تعدادی که کاربر می‌خواهد — بدون قاطی‌شدن گول/مستقیم
//   • نام‌گذاری مثل کانفیگ‌های معمولی پنل: «Aether - wg 894 🇩🇪» (بدون برند ربات)
//   • ماتریس پورت چندگانه (ضد تراتل ISP — همان درس مگا-ماتریس پنل)
//   • تست واقعی .conf با wireproxy (هندشیک واقعی — نه پینگ)
//
//  CLI:  node flash-core.js scan [sec]        → اسکن و نمایش استخر رتبه‌بندی‌شده
//        node flash-core.js warp 4 wg         → ۴ کانفیگ WireGuard .conf (تعداد دقیق)
//        node flash-core.js warp 4 awg        → ۴ کانفیگ AmneziaWG .conf
//        node flash-core.js warp 4 direct     → ۴ کانفیگ مستقیم (بهترین RTT)
//        node flash-core.js aether 6 DE,NL    → دقیقاً ۶ لینک اتر با خروجی تضمینی
//        node flash-core.js aether 8 direct   → دقیقاً ۸ لینک مستقیم
//        node flash-core.js test <file.conf>  → تست واقعی اتصال با wireproxy
//  API (require): { scan, buildLinks, buildWarp, buildAetherExact, zipFiles,
//                   register, warpTestConf, ensureIdentity, poolInfo, REGIONS, PORTS, eps }
// ═══════════════════════════════════════════════════════════════════════
"use strict";
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ENG = path.join(__dirname, "engine");                 // موتور aether (باینری رسمی v2.1.0 — هستهٔ پایه)
const WORK = "/tmp/flash-core";                             // دایرکتوری identity مشترک
const POOL_FILE = path.join(WORK, "flash-core-pool.json");  // آخرین استخر اسکن‌شده
const LOG = path.join(WORK, "scan.log");
const WIREPROXY = fs.existsSync("/tmp/wireproxy") ? "/tmp/wireproxy" : null;
// ماتریس پورت وارپ — تیر ۱ = پرسرعت‌ترین‌ها (مثل OP_PROFILES پنل: پخش‌کردن روی چند پورت = ضد تراتل ISP)
const PORTS = [2408, 894, 4500, 500, 1701, 894, 928, 1014, 854, 878, 864, 890, 903, 934, 943, 955, 987, 1002, 1070, 1387, 1843, 2371, 3138, 3476, 4177, 4198, 5279, 7103, 8742, 8886, 2408, 4500, 894, 2408, 500, 894, 928, 1701, 2408, 894, 4500, 1070, 894, 2408, 928, 500, 894, 2408, 4500];
const PORT_TIERS = [[2408, 894, 4500, 500, 1701], [928, 1014, 854, 878, 864], [890, 903, 934, 943, 955, 987, 1002], [1070, 1387, 1843, 2371, 3138, 3476, 4177, 4198, 5279, 7103, 8742, 8886]];

// ۲۳ کشور خروجی سایفون — مستقیم از AvailableEgressRegions موتور (P196)
const REGIONS = [
  ["AT","اتریا","🇦🇹"],["AU","استرالیا","🇦🇺"],["BE","بلژیک","🇧🇪"],["CA","کانادا","🇨🇦"],["CH","سوئیس","🇨🇭"],
  ["DE","آلمان","🇩🇪"],["DK","دانمارک","🇩🇰"],["ES","اسپانیا","🇪🇸"],["FI","فنلاند","🇫🇮"],["FR","فرانسه","🇫🇷"],
  ["GB","انگلیس","🇬🇧"],["IE","ایرلند","🇮🇪"],["IN","هند","🇮🇳"],["IT","ایتالیا","🇮🇹"],["JP","ژاپن","🇯🇵"],
  ["LT","لیتوانی","🇱🇹"],["NL","هلند","🇳🇱"],["NO","نروژ","🇳🇴"],["PL","لهستان","🇵🇱"],["RS","صربستان","🇷🇸"],
  ["SE","سوئد","🇸🇪"],["SG","سنگاپور","🇸🇬"],["US","آمریکا","🇺🇸"]
];
const FLAG = {}; REGIONS.forEach((r) => { FLAG[r[0]] = r[2]; });
const CF_BASE = "https://api.cloudflareclient.com/v0i1909051800";
const CF_HEADERS = { "User-Agent": "okhttp/3.12.1", "Content-Type": "application/json" };
const WARP_PUB = "bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=";

function ensureWork() { try { fs.mkdirSync(WORK, { recursive: true }); } catch (e) {} }

// ═══ identity مشترک موتور اتر (فقط یک‌بار) ═══
async function ensureIdentity() {
  ensureWork();
  const toml = path.join(WORK, "aether.toml");
  if (fs.existsSync(toml) && fs.statSync(toml).size > 100) return true;
  return new Promise((resolve) => {
    const p = spawn(ENG, ["--wg", "--turbo", "-4", "--bind", "127.0.0.1:1899", "--no-quick-reconnect"], { cwd: WORK, stdio: "ignore" });
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch (e) {} resolve(fs.existsSync(toml)); }, 20000);
    p.on("exit", () => { clearTimeout(t); resolve(fs.existsSync(toml)); });
  });
}

// ═══ اسکن زنده (موتور سوپر مگا سرعت — رتبه‌بندی RTT اندازه‌گیری‌شده) ═══
async function scan(opts = {}) {
  const seconds = Math.max(6, Math.min(30, Number(opts.seconds) || 12));
  await ensureIdentity();
  return new Promise((resolve) => {
    const out = [];
    const p = spawn(ENG, ["--wg", "--balanced", "-4", "--bind", "127.0.0.1:1898", "--no-quick-reconnect"], { cwd: WORK });
    const logStream = fs.createWriteStream(LOG, { flags: "w" });
    let buf = "";
    const harvest = (d) => {
      buf += d.toString();
      logStream.write(d);
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const ln of lines) {
        const m = ln.match(/wg candidate ok (\d+\.\d+\.\d+\.\d+:\d+) rtt=([\d.]+)ms/);
        if (m) out.push({ ep: m[1], rtt: parseFloat(m[2]) });
      }
    };
    p.stdout.on("data", harvest);
    p.stderr.on("data", harvest);
    const done = () => {
      try { p.kill("SIGKILL"); } catch (e) {}
      logStream.end();
      const seen = new Set();
      const pool = out.filter((x) => (seen.has(x.ep) ? false : (seen.add(x.ep), true))).sort((a, b) => a.rtt - b.rtt);
      const info = { at: new Date().toISOString(), engine: "FLASH Core v2.0 (aether v2.1.0 + mega-speed)", live: pool.length, pool };
      try { fs.writeFileSync(POOL_FILE, JSON.stringify(info, null, 1)); } catch (e) {}
      resolve(info);
    };
    setTimeout(done, seconds * 1000);
    p.on("exit", () => {});
  });
}

function poolInfo() {
  try { return JSON.parse(fs.readFileSync(POOL_FILE, "utf8")); } catch (e) { return null; }
}

// اندپوینت‌های اسکن‌شده (fallback: استخر تست‌شدهٔ قبلی)
function eps(info, n) {
  const i = info || poolInfo();
  if (i && Array.isArray(i.pool) && i.pool.length >= 3) return i.pool.slice(0, n).map((x) => x.ep);
  return FIXED_AETHER_EPS.slice(0, n).map((x) => x.ep);
}
// ═══ P198-r9 «استخر ثابت اتر» (فرمان مالک: آیپی کانفینگ‌های اتر ثابت باشد) ═══
// تحقیق از سورس رسمی: ArasClient فقط IP literal می‌پذیرد (AetherEndpoint.canonicalAddress — هاست‌نیم → null → سقوط به اسکن)
// و هستهٔ Rust فقط SocketAddr می‌پذیرد؛ پس «ثابت» = استخر IPهای تست‌شدهٔ همیشگی — همین لیست هر بار، بدون تغییر.
// engage.cloudflareclient.com هم همین 162.159.192.1 را می‌دهد (اولین seed رسمی موتور) — پایدارترین لنگر.
const FIXED_AETHER_EPS = [
  { ep: "162.159.192.1:2408", rtt: null },
  { ep: "188.114.96.202:894", rtt: null },
  { ep: "188.114.97.1:2408", rtt: null },
  { ep: "188.114.96.1:4500", rtt: null },
  { ep: "188.114.99.101:1701", rtt: null },
  { ep: "188.114.96.9:891", rtt: null }
];
const FIXED_POOL = { at: "fixed", engine: "FLASH Core v2.1 fixed-pool (P198-r9)", live: FIXED_AETHER_EPS.length, pool: FIXED_AETHER_EPS };

// ═══ ثبت حساب وارپ (x25519 بومی Node — بدون وابستگی) ═══
function warpKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).slice(16);
  const pub = publicKey.export({ type: "spki", format: "der" }).slice(12);
  return { privateKey: priv.toString("base64"), publicKey: pub.toString("base64") };
}
async function register() {
  const keys = warpKeyPair();
  const r1 = await fetch(CF_BASE + "/reg", {
    method: "POST", headers: CF_HEADERS,
    body: JSON.stringify({ install_id: "", tos: new Date().toISOString(), key: keys.publicKey, fcm_token: "", type: "ios", locale: "en_US" })
  });
  if (!r1.ok) throw new Error("WARP register: HTTP " + r1.status);
  const d1 = await r1.json();
  const id = d1.result && d1.result.id, token = d1.result && d1.result.token;
  if (!id || !token) throw new Error("WARP register: پاسخ ناقص");
  const r2 = await fetch(CF_BASE + "/reg/" + id, {
    method: "PATCH", headers: Object.assign({}, CF_HEADERS, { Authorization: "Bearer " + token }),
    body: JSON.stringify({ warp_enabled: true })
  });
  if (!r2.ok) throw new Error("WARP enable: HTTP " + r2.status);
  const res = (await r2.json()).result;
  const iface = res.config.interface, peers = res.config.peers || [];
  if (!iface || !iface.addresses || !iface.addresses.v4) throw new Error("WARP enable: کانفیگ ناقص");
  return {
    keys, id, token,
    v4: iface.addresses.v4, v6: iface.addresses.v6 || "",
    serverPub: (peers[0] && peers[0].public_key) || WARP_PUB,
    reserved: res.config.client_id || ""
  };
}
function reservedBytes(r) {
  if (!r) return [0, 0, 0];
  try { const s = Buffer.from(String(r).replace(/-/g, "+").replace(/_/g, "/"), "base64"); return [s[0] || 0, s[1] || 0, s[2] || 0]; } catch (e) { return [0, 0, 0]; }
}

// ═══ مولد کانفیگ‌های وارپ (.conf — برای اپ WG Tunnel) ═══
// فرمت‌ها: 'wg' = وایرگارد استاندارد (بدون Reserved — سازگار با همهٔ اپ‌ها؛ تست واقعی P198:
// هندشیک بدون Reserved جواب می‌دهد) · 'awg' = AmneziaWG ضد فیلتر (Jc/Jmin/Jmax/S1/S2/H1-H4) ·
// 'direct' = وایرگارد با بهترین اندپوینت اسکن‌شده (مسیر مستقیم — کمترین RTT)
function wgConf(w, ep, o) {
  o = o || {};
  const rb = reservedBytes(w.reserved);
  const addr6 = w.v6 ? w.v4 + "/32, " + w.v6 + "/128" : w.v4 + "/32";
  const lines = ["[Interface]", "PrivateKey = " + w.keys.privateKey, "Address = " + addr6, "DNS = 1.1.1.1", "MTU = 1280"];
  if (o.awg) {
    lines.push("S1 = 0", "S2 = 0", "Jc = 5", "Jmin = 64", "Jmax = 1024", "H1 = 1", "H2 = 2", "H3 = 3", "H4 = 4");
  }
  lines.push("", "[Peer]", "PublicKey = " + w.serverPub);
  if (o.withReserved) lines.push("Reserved = " + rb.join(", "));
  lines.push("AllowedIPs = 0.0.0.0/0, ::/0", "Endpoint = " + ep, "PersistentKeepalive = 25");
  return lines.join("\n") + "\n";
}
// count × کانفیگ — هر کانفیگ = اندپوینت متفاوت از استخر اسکن‌شده (مگا سرعت: RTT رتبه‌بندی‌شده)
function buildWarp(o) {
  const opts = o || {};
  const format = ["wg", "awg", "direct"].includes(opts.format) ? opts.format : "wg";
  const count = Math.max(1, Math.min(12, Number(opts.count) || 2));
  const info = opts.info || poolInfo();
  const w = opts.w;
  if (!w) throw new Error("w (حساب وارپ) لازم است");
  let epsN = eps(info, count);
  if (format === "direct") { const best = eps(info, 1); epsN = new Array(count).fill(0).map((_, i) => best[0] || epsN[i]); }
  const files = [];
  for (let i = 0; i < count; i++) {
    const ep = epsN[i % epsN.length];
    const name = "warp-" + (format === "awg" ? "amnezia" : format === "direct" ? "direct" : "wireguard") + "-" + (i + 1) + ".conf";
    files.push({
      name, endpoint: ep, rtt: (info && info.pool && info.pool.find((x) => x.ep === ep) || {}).rtt || null,
      conf: wgConf(w, ep, { awg: format === "awg", withReserved: format === "awg" })
    });
  }
  return { format, count, files, live: info && info.live };
}
// فایل wireproxy برای تست واقعی (ini — Reserved را پشتیبانی نمی‌کند = دقیقاً حالت WG Tunnel)
function wireproxyConf(confText, port) {
  const sec = confText.split("[Peer]")[0].split("\n").filter(Boolean).filter((x) => x.indexOf("[") !== 0);
  const peer = confText.split("[Peer]")[1].split("\n").filter(Boolean);
  const kv = (lines) => Object.fromEntries(lines.map((x) => { const i = x.indexOf("="); return [x.slice(0, i).trim(), x.slice(i + 1).trim()]; }));
  const I = kv(sec), P = kv(peer);
  return ["[Interface]", "Address = " + I["Address"], "PrivateKey = " + I["PrivateKey"], "DNS = 1.1.1.1", "MTU = 1280", "",
    "[Peer]", "PublicKey = " + P["PublicKey"], "Endpoint = " + P["Endpoint"], "AllowedIPs = 0.0.0.0/0, ::/0", "PersistentKeepalive = 25", "",
    "[Socks5]", "BindAddress = 127.0.0.1:" + port].join("\n") + "\n";
}
// تست واقعی .conf — هندشیک واقعی wireguard + خروجی warp (نه ICMP پینگ — درس P195)
async function warpTestConf(confText, timeoutMs) {
  if (!WIREPROXY) return { ok: false, why: "wireproxy not installed" };
  const port = 18990 + Math.floor(Math.random() * 80);
  const cfgPath = path.join(WORK, "wptest-" + port + ".conf");
  ensureWork();
  fs.writeFileSync(cfgPath, wireproxyConf(confText, port));
  const p = spawn(WIREPROXY, ["-c", cfgPath], { stdio: ["ignore", "pipe", "pipe"] });
  const t0 = Date.now();
  try {
    while (Date.now() - t0 < (timeoutMs || 30000)) {
      const out = await new Promise((res) => {
        execFile("/usr/bin/curl", ["-s", "--max-time", "8", "--socks5-hostname", "127.0.0.1:" + port, "https://cloudflare.com/cdn-cgi/trace"], { timeout: 12000 }, (e, so) => res(e ? null : so));
      });
      if (out && /warp=(on|plus)/.test(out)) {
        return {
          ok: true, ms: Date.now() - t0,
          ip: (out.match(/ip=([0-9a-fA-F:.]+)/) || [])[1] || "?",
          colo: (out.match(/colo=(\w+)/) || [])[1] || "?",
          loc: (out.match(/loc=(\w+)/) || [])[1] || "?"
        };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return { ok: false, why: "handshake-timeout" };
  } finally {
    try { p.kill("SIGKILL"); } catch (e) {}
    try { fs.unlinkSync(cfgPath); } catch (e) {}
  }
}

// ═══ مولد لینک‌های اتر — تعداد دقیق (P198: بدون قاطی‌شدن گول/مستقیم) ═══
// mode='countries' → دقیقاً count لینک با خروجی تضمینی همان کشورها (psiphon=chain&region=CC)
// mode='direct'    → دقیقاً count لینک مستقیم (بدون خروجی特定)
// pool='fixed' (پیش‌فرض P198-r9) → اندپوینت‌های ثابت تست‌شده — هر ساخت همان IPها (فرمان مالک: ثابت)
// pool='scanned' → استخر اسکن زنده (فقط وقتی صریحاً خواسته شود)
// نام‌گذاری مثل کانفیگ‌های معمولی پنل: «Aether - wg 894 🇩🇪» (بدون برند ربات — zq-mur4yq1m)
function buildAetherExact(o) {
  const opts = o || {};
  const fixed = opts.pool !== "scanned";
  const info = fixed ? FIXED_POOL : (opts.info || poolInfo());
  const list = fixed ? FIXED_AETHER_EPS.map((x) => x.ep) : eps(info, 12);
  const mode = opts.mode === "countries" ? "countries" : "direct";
  const count = Math.max(1, Math.min(24, Number(opts.count) || 8));
  const countries = (Array.isArray(opts.countries) ? opts.countries : []).filter((cc) => /^[A-Z]{2}$/.test(cc) && FLAG[cc]).slice(0, 8);
  const out = [];
  for (let i = 0; i < count; i++) {
    const ep = list[i % list.length];
    const port = String(ep.split(":")[1] || "894");
    if (mode === "countries" && countries.length) {
      const cc = countries[i % countries.length];
      const name = "Aether - wg " + port + " " + FLAG[cc] + " " + (count > 1 ? (i + 1) + " " : "") + cc;
      out.push("aether://" + ep + "?protocol=wg&scan=turbo&ip=both&psiphon=chain&region=" + cc + "#" + encodeURIComponent(name));
    } else {
      const name = "Aether - wg " + port + " 🌐" + (count > 1 ? " " + (i + 1) : "");
      out.push("aether://" + ep + "?protocol=wg&scan=turbo&ip=both#" + encodeURIComponent(name));
    }
  }
  return out;
}

// ═══ ZIP (store — بدون وابستگی) — برای ایمپورت یک‌کلیکی همهٔ کانفیگ‌ها در WG Tunnel ═══
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipFiles(files) {
  // files: [{name, data(Buffer|string)}] → Buffer (ZIP store method 0)
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const nameB = enc.encode(f.name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26); lh.writeUInt16LE(0, 28);
    chunks.push(lh, Buffer.from(nameB), data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, Buffer.from(nameB));
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, eocd]);
}

// ═══ مولد قدیمی v1 (سازگاری — دیگر در مسیرهای جدید استفاده نمی‌شود) ═══
function buildLinks(o = {}) {
  const info = o.info || poolInfo();
  const list = eps(info, 8);
  const regions = (Array.isArray(o.regions) ? o.regions : []).filter((cc) => /^[A-Z]{2}$/.test(cc) && REGIONS.some((r) => r[0] === cc)).slice(0, 8);
  const total = Math.max(2, Math.min(24, Number(o.count) || 8));
  const gool = o.gool !== false;
  const pre = (o.label || "FLASH") + " - Aether";
  const out = [];
  const budget = total - (gool ? 2 : 0);
  const nDirect = regions.length ? Math.max(1, Math.ceil(budget * 0.45)) : budget;
  for (let i = 0; i < nDirect && out.length < budget; i++) {
    out.push("aether://" + list[i % list.length] + "?protocol=wg&scan=turbo&ip=both#" + encodeURIComponent(pre + " " + (out.length + 1)));
  }
  let ri = 0;
  while (out.length < budget && regions.length) {
    const cc = regions[ri % regions.length];
    const R = REGIONS.find((x) => x[0] === cc);
    out.push("aether://" + list[(ri + 1) % list.length] + "?protocol=wg&scan=turbo&ip=both&psiphon=chain&region=" + cc + "#" + encodeURIComponent(pre + " " + (out.length + 1) + " " + R[2] + " " + R[1]));
    ri++;
  }
  if (gool && list.length >= 2) {
    const oP = list[0].split(":"), iP = list[1 % list.length].split(":");
    out.push("aether://?protocol=gool&scan=turbo&ip=both&outer=" + encodeURIComponent(oP[0] + ":" + (Number(oP[1]) || 2408)) + "&inner=" + encodeURIComponent(iP[0] + ":" + (Number(iP[1]) || 894)) + "#" + encodeURIComponent(pre + " Gool 1"));
    if (list.length >= 3) {
      const gP = list[2].split(":");
      out.push("aether://?protocol=gool&scan=turbo&ip=both&outer=" + encodeURIComponent(gP[0] + ":" + (Number(gP[1]) || 4500)) + "&inner=" + encodeURIComponent(iP[0] + ":894") + "#" + encodeURIComponent(pre + " Gool 2"));
    }
  }
  return out;
}

// ═══ CLI ═══
if (require.main === module) {
  const cmd = process.argv[2] || "scan";
  (async () => {
    if (cmd === "scan") {
      console.log("⚡ FLASH Core v2 — اسکن زندهٔ اندپوینت‌ها (رتبه‌بندی RTT)…");
      const t0 = Date.now();
      const info = await scan({ seconds: Number(process.argv[3]) || 12 });
      console.log("✅ زنده:", info.live, "· زمان:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
      info.pool.slice(0, 12).forEach((x, i) => console.log("  " + (i + 1) + ". " + x.ep + "  rtt=" + x.rtt.toFixed(1) + "ms"));
    } else if (cmd === "warp") {
      const count = Number(process.argv[3]) || 4;
      const format = (process.argv[4] || "wg").toLowerCase();
      console.log("⚡ اسکن تازه → ثبت حساب → " + count + " کانفیگ " + format + " …");
      const info = await scan({});
      const w = await register();
      const b = buildWarp({ info, w, format, count });
      for (const f of b.files) console.log("── " + f.name + " (" + f.endpoint + (f.rtt ? " · rtt " + f.rtt.toFixed(0) + "ms" : "") + ")\n" + f.conf);
      console.log("✅ " + b.count + " فایل · استخر زنده: " + b.live);
    } else if (cmd === "aether") {
      const count = Number(process.argv[3]) || 6;
      const arg4 = (process.argv[4] || "direct");
      const countries = arg4 !== "direct" ? arg4.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
      console.log("⚡ اسکن تازه → دقیقاً " + count + " لینک اتر (" + (countries.length ? "خروجی: " + countries.join(",") : "مستقیم") + ")…");
      const info = await scan({});
      const links = buildAetherExact({ info, count, mode: countries.length ? "countries" : "direct", countries });
      links.forEach((l) => console.log(l));
      console.log("── دقیقاً " + links.length + " لینک · استخر زنده: " + info.live);
    } else if (cmd === "test") {
      const f = process.argv[3];
      if (!f) { console.log("نام فایل .conf بده"); process.exit(1); }
      console.log("🧪 تست واقعی اتصال wireproxy…");
      const r = await warpTestConf(fs.readFileSync(f, "utf8"), 40000);
      console.log(JSON.stringify(r, null, 1));
      process.exit(r.ok ? 0 : 2);
    } else {
      console.log("flash-core.js scan [sec] | warp N wg|awg|direct | aether N CC,CC|direct | test file.conf");
    }
    process.exit(0);
  })().catch((e) => { console.error("ERR", e.message); process.exit(1); });
}

module.exports = { scan, buildLinks, buildAetherExact, buildWarp, wgConf, zipFiles, register, warpTestConf, reservedBytes, ensureIdentity, poolInfo, REGIONS, FLAG, PORTS, PORT_TIERS, eps, FIXED_AETHER_EPS, FIXED_POOL };

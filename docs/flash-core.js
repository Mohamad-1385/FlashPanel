#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
//  ⚡ FLASH CORE v1.0 — هستهٔ کاستوم اتر (P197)
//  ترکیب موتور Aether (wg/gool/psiphon) با هستهٔ خودمان:
//   • موتور سوپر مگا سرعت: اسکن زندهٔ اندپوینت‌ها + رتبه‌بندی بر اساس RTT اندازه‌گیری‌شده
//     (همان فلسفهٔ موتور مگا سرعت پنل: رله‌ها بر اساس سرعت «اندازه‌گیری‌شده» رتبه می‌گیرند)
//   • هر ساخت = اسکن تازه (فرمان مالک: «هر سری اسکن کنه بعد بسازه»)
//   • identity مشترک: ثبت‌نام وارپ فقط یک‌بار (بدون ریسک محدودیت کلادفلر)
//   • خروجی چند کشور: زنجیرهٔ سایفون region=CC (۲۳ کشور — تست‌شده با مدرک)
//
//  CLI:  node flash-core.js scan              → اسکن و نمایش استخر رتبه‌بندی‌شده
//        node flash-core.js build [--cc DE,NL] [--count 8] [--gool] [--label NAME]
//        node flash-core.js test DE           → تست واقعی خروجی کشور + جمنای
//  API (require):  { scan, buildLinks, ensureIdentity, REGIONS, poolInfo }
// ═══════════════════════════════════════════════════════════════════════
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ENG = path.join(__dirname, "engine");                 // موتور aether (باینری رسمی v2.1.0 — هستهٔ پایه)
const WORK = "/tmp/flash-core";                             // دایرکتوری identity مشترک
const POOL_FILE = path.join(WORK, "flash-core-pool.json");  // آخرین استخر اسکن‌شده
const LOG = path.join(WORK, "scan.log");
const PORTS = [2408, 500, 1701, 4500, 854, 859, 864, 878, 880, 890, 891, 894, 903, 908, 928, 934, 939, 942, 943, 945, 946, 955, 968, 987, 988, 1002, 1010, 1014, 1018, 1070, 1074, 1180, 1387, 1843, 2371, 2506, 3138, 3476, 3581, 3854, 4177, 4198, 4233, 5279, 5956, 7103, 7152, 7156, 7281, 7559, 8319, 8742, 8854, 8886];

// ۲۳ کشور خروجی سایفون — مستقیم از AvailableEgressRegions موتور (P196)
const REGIONS = [
  ["AT","اتریا","🇦🇹"],["AU","استرالیا","🇦🇺"],["BE","بلژیک","🇧🇪"],["CA","کانادا","🇨🇦"],["CH","سوئیس","🇨🇭"],
  ["DE","آلمان","🇩🇪"],["DK","دانمارک","🇩🇰"],["ES","اسپانیا","🇪🇸"],["FI","فنلاند","🇫🇮"],["FR","فرانسه","🇫🇷"],
  ["GB","انگلیس","🇬🇧"],["IE","ایرلند","🇮🇪"],["IN","هند","🇮🇳"],["IT","ایتالیا","🇮🇹"],["JP","ژاپن","🇯🇵"],
  ["LT","لیتوانی","🇱🇹"],["NL","هلند","🇳🇱"],["NO","نروژ","🇳🇴"],["PL","لهستان","🇵🇱"],["RS","صربستان","🇷🇸"],
  ["SE","سوئد","🇸🇪"],["SG","سنگاپور","🇸🇬"],["US","آمریکا","🇺🇸"]
];

function ensureWork() { try { fs.mkdirSync(WORK, { recursive: true }); } catch (e) {} }

// identity فقط یک‌بار ساخته می‌شود (سریال — بدون ریسک ثبت‌نام موازی)
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

// ═══ اسکن زنده (موتور سوپر مگا سرعت) ═══
// موتور اسکن balanced خودش هزاران کاندیدای IP:PORT را با هندشیک + دیتاپلین واقعی می‌سنجد؛
// ما خطوط «wg candidate ok … rtt=…» را برداشت و بر اساس RTT مرتب می‌کنیم.
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
      // حذف تکراری‌ها + رتبه‌بندی RTT (مگا سرعت: کمترین RTT = بهترین)
      const seen = new Set();
      const pool = out.filter((x) => (seen.has(x.ep) ? false : (seen.add(x.ep), true))).sort((a, b) => a.rtt - b.rtt);
      const info = { at: new Date().toISOString(), engine: "FLASH Core v1.0 (aether v2.1.0 + mega-speed)", live: pool.length, pool };
      try { fs.writeFileSync(POOL_FILE, JSON.stringify(info, null, 1)); } catch (e) {}
      resolve(info);
    };
    setTimeout(done, seconds * 1000);
    p.on("exit", () => { /* اگر موتور زودتر تمام شد */ });
  });
}

function poolInfo() {
  try { return JSON.parse(fs.readFileSync(POOL_FILE, "utf8")); } catch (e) { return null; }
}

// اندپوینت‌های اسکن‌شده (fallback: استخر تست‌شدهٔ قبلی در صورت نبود اسکن)
function eps(info, n) {
  const i = info || poolInfo();
  if (i && Array.isArray(i.pool) && i.pool.length >= 3) return i.pool.slice(0, n).map((x) => x.ep);
  return ["188.114.96.202:894", "188.114.97.1:2408", "188.114.96.1:4500", "162.159.192.1:500", "188.114.99.101:1701", "188.114.96.9:891"];
}

// ═══ مولد لینک (از استخر «اسکن‌شده») ═══
function buildLinks(o = {}) {
  const info = o.info || poolInfo();
  const list = eps(info, 8);
  const regions = (Array.isArray(o.regions) ? o.regions : []).filter((cc) => /^[A-Z]{2}$/.test(cc) && REGIONS.some((r) => r[0] === cc)).slice(0, 8);
  const total = Math.max(2, Math.min(24, Number(o.count) || 8));
  const gool = o.gool !== false;
  const pre = (o.label || "FLASH") + " - Aether";
  const scannedNote = info && info.live ? " (اندپوینت اسکن‌شدهٔ زنده)" : "";
  const out = [];
  const budget = total - (gool ? 2 : 0);
  const nDirect = regions.length ? Math.max(1, Math.ceil(budget * 0.45)) : budget;
  for (let i = 0; i < nDirect && out.length < budget; i++) {
    out.push("aether://" + list[i % list.length] + "?protocol=wg&scan=turbo&ip=both#" + encodeURIComponent(pre + " " + (out.length + 1) + scannedNote));
  }
  let ri = 0;
  while (out.length < budget && regions.length) {
    const cc = regions[ri % regions.length];
    const R = REGIONS.find((x) => x[0] === cc);
    out.push("aether://" + list[(ri + 1) % list.length] + "?protocol=wg&scan=turbo&ip=both&psiphon=chain&region=" + cc + "#" + encodeURIComponent(pre + " " + (out.length + 1) + " " + R[2] + " " + R[1]));
    ri++;
  }
  if (gool && list.length >= 2) {
    const [oIp, oPort] = list[0].split(":"); const [iIp, iPort] = list[1 % list.length].split(":");
    out.push("aether://?protocol=gool&scan=turbo&ip=both&outer=" + encodeURIComponent(oIp + ":" + (Number(oPort) || 2408)) + "&inner=" + encodeURIComponent(iIp + ":" + (Number(iPort) || 894)) + "#" + encodeURIComponent(pre + " Gool 1 (خروجی متفاوت)"));
    if (list.length >= 3) {
      const [g2Ip, g2Port] = list[2].split(":");
      out.push("aether://?protocol=gool&scan=turbo&ip=both&outer=" + encodeURIComponent(g2Ip + ":" + (Number(g2Port) || 4500)) + "&inner=" + encodeURIComponent(iIp + ":894") + "#" + encodeURIComponent(pre + " Gool 2 (خروجی متفاوت)"));
    }
  }
  return out;
}

// ═══ CLI ═══
if (require.main === module) {
  const cmd = process.argv[2] || "scan";
  (async () => {
    if (cmd === "scan") {
      console.log("⚡ FLASH Core — اسکن زندهٔ اندپوینت‌ها (موتور سوپر مگا سرعت: رتبه‌بندی RTT)…");
      const t0 = Date.now();
      const info = await scan({ seconds: Number(process.argv[3]) || 12 });
      console.log("✅ زنده:", info.live, "· زمان:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
      info.pool.slice(0, 12).forEach((x, i) => console.log("  " + (i + 1) + ". " + x.ep + "  rtt=" + x.rtt.toFixed(1) + "ms"));
      console.log("📦 pool →", POOL_FILE);
    } else if (cmd === "build") {
      const args = process.argv.slice(3);
      const get = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
      const regions = (get("cc") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      const count = Number(get("count")) || 8;
      const label = get("label") || "FLASH";
      console.log("⚡ اسکن تازه قبل از ساخت (فرمان: هر سری اسکن کنه بعد بسازه)…");
      const info = await scan({});
      const links = buildLinks({ info, regions, count, gool: true, label });
      links.forEach((l) => console.log(l));
      console.log("── " + info.live + " اندپوینت زنده · بهترین rtt=" + (info.pool[0] ? info.pool[0].rtt.toFixed(0) : "?") + "ms");
    } else if (cmd === "test") {
      const cc = (process.argv[3] || "DE").toUpperCase();
      console.log("🧪 تست خروجی واقعی " + cc + " (زنجیرهٔ سایفون)…");
      const { execSync } = require("child_process");
      const r = execSync("bash " + path.join(__dirname, "test-country.sh") + " " + cc, { timeout: 260000 }).toString();
      console.log(r);
    } else {
      console.log("flash-core.js scan|build|test");
    }
    process.exit(0);
  })().catch((e) => { console.error("ERR", e.message); process.exit(1); });
}

module.exports = { scan, buildLinks, ensureIdentity, poolInfo, REGIONS, PORTS, eps };

// VOLT UI — «میز فرمان ولت» — Tailwind (5%) — completely new design language:
// graphite + electric volt, top command bar (no drawer/sidebar like flash),
// bento KPI grid, mono numerals, bottom status strip. RTL Persian.
import { Env, Key, PanelSettings } from "./types";
import { VERSION, CORE_ID, LOCATIONS, FRAG_PROFILES } from "./consts";
import { Stats } from "./types";

const CSS = "__VOLT_CSS__";   // ← build script injects compiled Tailwind here

const JS_APP = `
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function clock(){const d=new Date(Date.now()+3.5*3600e3);const t=d.toISOString().substr(11,8);const el=$('#clk');if(el)el.textContent=t+' Tehran';}
setInterval(clock,1000);clock();
async function api(p,o){const r=await fetch(p,o);return r.json().catch(()=>({ok:false}))}
function toast(t){const n=document.createElement('div');n.className='volt-toast';n.textContent=t;document.body.appendChild(n);setTimeout(()=>n.remove(),1800)}
async function cp(txt,btn){try{await navigator.clipboard.writeText(txt);toast('کپی شد ✓');if(btn){btn.classList.add('ok');setTimeout(()=>btn.classList.remove('ok'),900)}}catch(e){toast('خطای کپی')}}
window.cp=cp;
async function ping(loc,btn){btn.textContent='…';btn.disabled=true;const r=await api('/api/v1/probe?loc='+loc);btn.textContent=r.ok?(r.ms+'ms'):'✗';btn.disabled=false;if(r.ok&&r.ms<600)btn.classList.add('ok')}
window.ping=ping;
async function bridgeSend(ev){ev.preventDefault();const i=$('#cmd');const c=i.value.trim();if(!c)return;i.value='';await api('/api/v1/bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cmd:c})});termPrint('› '+c,'in')}
let _last=0;
async function termPoll(){const r=await api('/api/v1/bridge?after='+_last);if(r.ok&&r.outbox)for(const m of r.outbox){_last=Math.max(_last,m.id);termPrint(m.text,'out')}}
function termPrint(t,k){const b=$('#tout');if(!b)return;const l=document.createElement('div');l.className='tl '+k;l.textContent=t;b.appendChild(l);b.scrollTop=b.scrollHeight}
setInterval(termPoll,2000);termPoll();
async function saveSettings(){const s={adblock:$('#st-ad')?.checked?1:0,ip_mode:document.querySelector('input[name=ipm]:checked')?.value||'rotate'};const r=await api('/api/v1/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(s)});toast(r.ok?'ذخیره شد ✓':'خطا')}
window.saveSettings=saveSettings;
async function newKey(ev){ev.preventDefault();const b={name:$('#nk-name').value||'بدون نام',loc:$('#nk-loc').value,quota_gb:+$('#nk-quota').value||0,expiry_days:+$('#nk-days').value||0};const r=await api('/api/v1/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});toast(r.ok?'کلید ساخته شد ✓':'خطا');if(r.ok)setTimeout(()=>location.reload(),700)}
window.newKey=newKey;
async function keyAct(uuid,act,val){const body={};body[act]=val;const r=await api('/api/v1/keys/'+uuid,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});toast(r.ok?'اعمال شد ✓':'خطا');if(act==='del'){if(r.ok)setTimeout(()=>location.reload(),500)}else if(act==='loc'||act==='ip_mode')setTimeout(()=>location.reload(),600)}
window.keyAct=keyAct;
async function delKey(uuid){if(!confirm('حذف شود؟'))return;await keyAct(uuid,'status','disabled');const r=await api('/api/v1/keys/'+uuid,{method:'DELETE'});toast(r.ok?'حذف شد':'خطا');if(r.ok)setTimeout(()=>location.reload(),500)}
window.delKey=delKey;
`;

function fmtBytes(n: number): string {
  if (!n) return "۰";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < 4) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}
const fa = (s: string | number): string => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

const GLYPH = `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor"/></svg>`;
const TABS: { id: string; fa: string }[] = [
  { id: "", fa: "میز فرمان" }, { id: "locations", fa: "لوکیشن‌ها" }, { id: "keys", fa: "کلیدها و اشتراک" },
  { id: "settings", fa: "تنظیمات" }, { id: "terminal", fa: "ترمینال" },
];

function shell(env: Env, active: string, inner: string, title: string): string {
  const tabs = TABS.map((t) => {
    const on = t.id === active;
    return `<a href="/app${t.id ? "/" + t.id : ""}" class="px-3 py-1.5 text-[13px] rounded-md transition-colors ${on ? "bg-volt/15 text-volt font-semibold" : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"}">${t.fa}</a>`;
  }).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · VOLT</title>
<style>${CSS}</style></head>
<body class="bg-volt-bg text-zinc-100 min-h-screen font-sans antialiased">
<header class="sticky top-0 z-40 h-14 border-b border-white/[.07] bg-volt-bg/85 backdrop-blur-md flex items-center gap-2 px-4">
  <div class="flex items-center gap-2.5 me-auto">
    <span class="grid place-items-center w-8 h-8 rounded-lg bg-volt text-black shadow-glow">${GLYPH}</span>
    <div class="leading-none"><div class="font-extrabold tracking-tight text-[15px]">ولت <span class="text-volt">VOLT</span></div>
    <div class="text-[10px] text-zinc-500 mt-1">${fa(CORE_ID)} · GoCore</div></div>
  </div>
  <nav class="hidden sm:flex items-center gap-1">${tabs}</nav>
  <div class="flex sm:hidden items-center gap-1 overflow-x-auto no-scrollbar">${tabs}</div>
</header>
<main class="max-w-6xl mx-auto px-4 py-6 pb-16">${inner}</main>
<footer class="fixed bottom-0 inset-x-0 z-40 h-7 border-t border-white/[.07] bg-volt-bg/90 backdrop-blur-md flex items-center gap-4 px-4 text-[11px] font-mono text-zinc-500">
  <span class="text-volt">●</span><span>BUILD v${fa(VERSION)}</span><span class="hidden sm:inline">GOCORE ONLINE</span>
  <span class="ms-auto hidden sm:inline">WS-PATH CONNECTED</span><span id="clk">--:--:--</span>
</footer>
<script>${JS_APP}</script></body></html>`;
}

export function decoyPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Site</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#334;display:grid;place-items:center;min-height:100vh;margin:0}h1{font-size:1.5rem;font-weight:600}</style>
</head><body><div style="text-align:center"><h1>Coming soon</h1><p style="color:#889">This site is under construction.</p></div></body></html>`;
}

export function loginPage(gate: string): string {
  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ورود · VOLT</title>
<style>${CSS}</style></head>
<body class="bg-volt-bg text-zinc-100 min-h-screen font-sans grid place-items-center antialiased">
<div class="w-[min(92vw,380px)] text-center">
  <div class="mx-auto mb-6 grid place-items-center w-20 h-20 rounded-2xl bg-volt text-black shadow-glow-lg rotate-3">${GLYPH.replace('w-5 h-5', 'w-10 h-10')}</div>
  <h1 class="text-2xl font-extrabold tracking-tight">ولت <span class="text-volt">VOLT</span></h1>
  <p class="text-zinc-500 text-sm mt-2 mb-8">میز فرمان نسل جدید — پرقدرت با Go</p>
  <form method="POST" action="/g/${gate}/auth" class="space-y-3">
    <button class="w-full h-12 rounded-xl bg-volt text-black font-bold text-[15px] hover:brightness-110 active:scale-[.98] transition shadow-glow">ورود به میز فرمان</button>
  </form>
  <p class="mt-8 text-[11px] font-mono text-zinc-600">${fa(CORE_ID)} · v${fa(VERSION)}</p>
</div></body></html>`;
}

export function dashboardHTML(env: Env, stats: Stats, settings: PanelSettings): string {
  const kpi = (label: string, value: string, sub: string, glow = false) => `
  <div class="rounded-xl border ${glow ? "border-volt/25 bg-volt/[.04]" : "border-white/[.07] bg-panel"} p-5 hover:border-white/[.14] transition-colors">
    <div class="text-[11px] text-zinc-500 mb-2">${label}</div>
    <div class="text-3xl font-extrabold ${glow ? "text-volt" : ""} tabular-nums">${value}</div>
    <div class="text-[11px] text-zinc-500 mt-1.5">${sub}</div>
  </div>`;
  const inner = `
  <div class="flex items-center gap-2 mb-5 text-sm text-zinc-400">
    <span class="w-2 h-2 rounded-full bg-volt animate-pulse"></span>
    هستهٔ Go متصل · <span class="text-zinc-200 font-semibold">${settings.panel_name || "VOLT"}</span> فعال است
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${kpi("کلیدهای فعال", fa(stats.active) + " / " + fa(stats.keys), "از مجموع کلیدها", true)}
    ${kpi("آنلاین (۵ دقیقه)", fa(stats.online), "اتصال زندهٔ تونل")}
    ${kpi("مصرف امروز", fa(fmtBytes(stats.trafficToday)), "ترافیک عبوری امروز")}
    ${kpi("لوکیشن‌ها", fa(stats.locations), "رله‌های تأییدشده")}
  </div>
  <div class="grid lg:grid-cols-3 gap-3 mt-3">
    <div class="rounded-xl border border-white/[.07] bg-panel p-5 lg:col-span-2">
      <div class="text-[13px] font-bold mb-3">معماری نسل جدید</div>
      <div class="space-y-3 text-[13px] text-zinc-400 leading-6">
        <div class="flex gap-3"><span class="text-volt font-mono shrink-0">75%</span><span>بک‌اند و ربات با <b class="text-zinc-200">Go</b> — مدیریت کلیدها، اعلان‌ها و پل تلگرام (پروسهٔ <code class="font-mono text-volt">voltd</code>)</span></div>
        <div class="flex gap-3"><span class="text-volt font-mono shrink-0">20%</span><span>لایهٔ لبه با <b class="text-zinc-200">TypeScript</b> — تونل VLESS، اشتراک‌ها و API روی Cloudflare Workers</span></div>
        <div class="flex gap-3"><span class="text-volt font-mono shrink-0">5%</span><span>ظاهر با <b class="text-zinc-200">Tailwind CSS</b> — همین رابط که می‌بینید</span></div>
      </div>
    </div>
    <div class="rounded-xl border border-white/[.07] bg-panel p-5">
      <div class="text-[13px] font-bold mb-3">وضعیت سیستم</div>
      <div class="space-y-2.5 text-[12px]">
        <div class="flex justify-between"><span class="text-zinc-500">نسخه</span><span class="font-mono">v${fa(VERSION)}</span></div>
        <div class="flex justify-between"><span class="text-zinc-500">هسته</span><span class="font-mono text-volt">${CORE_ID}</span></div>
        <div class="flex justify-between"><span class="text-zinc-500">ضد تبلیغ</span><span>${settings.adblock ? "روشن" : "خاموش"}</span></div>
        <div class="flex justify-between"><span class="text-zinc-500">حالت IP</span><span>${settings.ip_mode === "fixed" ? "ثابت 📌" : "چرخشی 🔁"}</span></div>
        <div class="flex justify-between"><span class="text-zinc-500">مصرف کل</span><span class="tabular-nums">${fa(fmtBytes(stats.lifetimeBytes))}</span></div>
      </div>
    </div>
  </div>`;
  return shell(env, "", inner, "میز فرمان");
}

export function locationsHTML(env: Env): string {
  const groups: Record<string, string> = { me: "خاورمیانه و همسایگان", eu: "اروپا", asia: "آسیا", am: "آمریکا", oc: "اقیانوسیه" };
  const rows = Object.entries(groups).map(([cont, label]) => {
    const list = LOCATIONS.filter((c) => c.cont === cont);
    if (!list.length) return "";
    return `
  <div class="mt-6"><div class="text-[12px] font-bold text-zinc-500 mb-2.5">${label}</div>
  <div class="rounded-xl border border-white/[.07] bg-panel divide-y divide-white/[.05]">
    ${list.map((c) => `
    <div class="flex items-center gap-3 px-4 py-3 hover:bg-white/[.02] transition-colors">
      <span class="text-xl w-8 text-center">${c.flag}</span>
      <div class="min-w-0 flex-1">
        <div class="text-[13.5px] font-semibold">${c.fa} <span class="text-zinc-600 font-mono text-[11px]">${c.id.toUpperCase()}</span></div>
        <div class="text-[11.5px] text-zinc-500 truncate">${c.city} — ${c.note}</div>
      </div>
      <span class="hidden sm:inline text-[10.5px] font-mono text-zinc-600">${fa(c.relays.length)} رله</span>
      <button onclick="ping('${c.id}',this)" class="h-8 px-3 rounded-lg border border-white/10 text-[11.5px] font-mono hover:border-volt/40 hover:text-volt transition-colors">تست</button>
    </div>`).join("")}
  </div></div>`;
  }).join("");
  return shell(env, "locations", `
  <div class="mb-2"><h2 class="text-lg font-extrabold">لوکیشن‌ها</h2>
  <p class="text-[12.5px] text-zinc-500 mt-1">خروجی هر کشور از رله‌های تأییدشده عبور می‌کند — برای هر کلید از بخش کلیدها قابل انتخاب است.</p></div>${rows}`, "لوکیشن‌ها");
}

export function keysHTML(env: Env, keys: Key[], host: string): string {
  const cards = keys.map((k) => {
    const usedPct = k.quota_gb > 0 ? Math.min(100, (k.used_bytes / (k.quota_gb * 1024 ** 3)) * 100) : 0;
    const expired = k.expiry_ms > 0 && k.expiry_ms < Date.now();
    const subBase = `https://${host}/sub/${k.uuid}`;
    const locOpts = [`<option value="">بدون لوکیشن</option>`, ...LOCATIONS.map((c) => `<option value="${c.id}" ${k.loc === c.id ? "selected" : ""}>${c.flag} ${c.fa}</option>`)].join("");
    return `
  <div class="rounded-xl border border-white/[.07] bg-panel p-5 mb-3">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <span class="font-bold text-[15px]">${k.name}</span>
      <span class="px-2 py-0.5 rounded-md text-[10.5px] font-mono ${k.status === "active" && !expired ? "bg-volt/15 text-volt" : "bg-red-500/15 text-red-400"}">${k.status === "active" && !expired ? "فعال" : "غیرفعال"}</span>
      ${k.ip_mode === "fixed" ? '<span class="px-2 py-0.5 rounded-md text-[10.5px] bg-white/5 text-zinc-400">IP ثابت 📌</span>' : ""}
      ${k.adblock ? '<span class="px-2 py-0.5 rounded-md text-[10.5px] bg-white/5 text-zinc-400">ضدتبلیغ 🛡</span>' : ""}
      <button onclick="delKey('${k.uuid}')" class="ms-auto h-8 px-3 rounded-lg border border-red-500/25 text-red-400 text-[11.5px] hover:bg-red-500/10 transition-colors">حذف</button>
    </div>
    <div class="text-[11px] font-mono text-zinc-500 mb-3 truncate" dir="ltr">${k.uuid}</div>
    ${k.quota_gb > 0 ? `
    <div class="h-1.5 rounded-full bg-white/[.06] overflow-hidden mb-1.5"><div class="h-full bg-volt rounded-full" style="width:${usedPct.toFixed(1)}%"></div></div>
    <div class="text-[11px] text-zinc-500 mb-3">${fa(fmtBytes(k.used_bytes))} از ${fa(k.quota_gb)} گیگابایت</div>` : `
    <div class="text-[11px] text-zinc-500 mb-3">مصرف: ${fa(fmtBytes(k.used_bytes))} · نامحدود</div>`}
    <div class="grid sm:grid-cols-2 gap-3 mb-3">
      <label class="block"><span class="text-[11px] text-zinc-500">لوکیشن</span>
        <select onchange="keyAct('${k.uuid}','loc',this.value)" class="mt-1 w-full h-9 rounded-lg bg-volt-bg border border-white/10 px-2 text-[12.5px] focus:border-volt/50 outline-none">${locOpts}</select></label>
      <label class="block"><span class="text-[11px] text-zinc-500">حالت IP</span>
        <div class="mt-1 grid grid-cols-2 h-9 rounded-lg bg-volt-bg border border-white/10 overflow-hidden">
          <button onclick="keyAct('${k.uuid}','ip_mode','rotate')" class="text-[12px] ${k.ip_mode !== "fixed" ? "bg-volt/15 text-volt font-semibold" : "text-zinc-400"}">چرخشی</button>
          <button onclick="keyAct('${k.uuid}','ip_mode','fixed')" class="text-[12px] ${k.ip_mode === "fixed" ? "bg-volt/15 text-volt font-semibold" : "text-zinc-400"}">ثابت</button>
        </div></label>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[11px] text-zinc-500 me-1">لینک اشتراک:</span>
      <button onclick="cp('${subBase}?format=base64&frag=mci',this)" class="h-8 px-3 rounded-lg border border-white/10 text-[11.5px] hover:border-volt/40 hover:text-volt transition-colors">v2rayNG</button>
      <button onclick="cp('${subBase}?format=xjson&frag=mci',this)" class="h-8 px-3 rounded-lg border border-white/10 text-[11.5px] hover:border-volt/40 hover:text-volt transition-colors">Xray کامل</button>
      <button onclick="cp('${subBase}?format=singbox',this)" class="h-8 px-3 rounded-lg border border-white/10 text-[11.5px] hover:border-volt/40 hover:text-volt transition-colors">sing-box</button>
      <button onclick="cp('${subBase}?format=clash',this)" class="h-8 px-3 rounded-lg border border-white/10 text-[11.5px] hover:border-volt/40 hover:text-volt transition-colors">Clash</button>
      <button onclick="cp('${subBase}',this)" class="h-8 px-3 rounded-lg bg-volt text-black text-[11.5px] font-bold hover:brightness-110">کپی لینک خام</button>
    </div>
  </div>`;
  }).join("") || `<div class="rounded-xl border border-dashed border-white/10 p-10 text-center text-zinc-500 text-sm">هنوز کلیدی ساخته نشده — اولین کلید را بسازید ⚡</div>`;

  const fragRows = Object.entries(FRAG_PROFILES).map(([id, p]) => `<div class="flex justify-between px-4 py-2.5 text-[12.5px]"><span>${p.label}</span><code class="font-mono text-volt" dir="ltr">?frag=${id}</code></div>`).join("");

  return shell(env, "keys", `
  <div class="mb-4"><h2 class="text-lg font-extrabold">کلیدها و اشتراک</h2>
  <p class="text-[12.5px] text-zinc-500 mt-1">هر کلید = یک اشتراک کامل با تمام فرمت‌ها. ساخت کلید جدید هم از اینجا هم از ربات Go.</p></div>
  <details class="rounded-xl border border-volt/25 bg-volt/[.04] p-5 mb-4">
    <summary class="cursor-pointer text-[13px] font-bold">＋ ساخت کلید جدید</summary>
    <form onsubmit="newKey(event)" class="grid sm:grid-cols-4 gap-3 mt-4">
      <label class="block"><span class="text-[11px] text-zinc-500">نام</span><input id="nk-name" class="mt-1 w-full h-9 rounded-lg bg-volt-bg border border-white/10 px-2.5 text-[13px] focus:border-volt/50 outline-none" placeholder="مثلاً: گوشی من"></label>
      <label class="block"><span class="text-[11px] text-zinc-500">لوکیشن</span><select id="nk-loc" class="mt-1 w-full h-9 rounded-lg bg-volt-bg border border-white/10 px-2 text-[12.5px]"><option value="">بدون لوکیشن</option>${LOCATIONS.map((c) => `<option value="${c.id}">${c.flag} ${c.fa}</option>`).join("")}</select></label>
      <label class="block"><span class="text-[11px] text-zinc-500">حجم (GB)</span><input id="nk-quota" type="number" min="0" class="mt-1 w-full h-9 rounded-lg bg-volt-bg border border-white/10 px-2.5 text-[13px] focus:border-volt/50 outline-none" placeholder="0 = نامحدود"></label>
      <label class="block"><span class="text-[11px] text-zinc-500">اعتبار (روز)</span><input id="nk-days" type="number" min="0" class="mt-1 w-full h-9 rounded-lg bg-volt-bg border border-white/10 px-2.5 text-[13px] focus:border-volt/50 outline-none" placeholder="0 = نامحدود"></label>
      <button class="sm:col-span-4 h-10 rounded-lg bg-volt text-black font-bold text-[13.5px] hover:brightness-110 active:scale-[.99] transition">ساخت کلید ⚡</button>
    </form>
  </details>
  ${cards}
  <div class="mt-6 rounded-xl border border-white/[.07] bg-panel divide-y divide-white/[.05]">
    <div class="px-4 py-3 text-[13px] font-bold">پروفایل‌های فرگمنت هر سیم‌کارت</div>${fragRows}
  </div>`, "کلیدها");
}

export function settingsHTML(env: Env, s: PanelSettings): string {
  return shell(env, "settings", `
  <div class="mb-4"><h2 class="text-lg font-extrabold">تنظیمات</h2>
  <p class="text-[12.5px] text-zinc-500 mt-1">پیش‌فرض‌های پنل — هر کلید می‌تواند شخصی‌سازی خودش را داشته باشد.</p></div>
  <div class="rounded-xl border border-white/[.07] bg-panel p-5 space-y-5">
    <label class="flex items-center justify-between gap-4 cursor-pointer">
      <div><div class="text-[13.5px] font-semibold">مسدودسازی تبلیغات و ردیاب‌ها</div>
      <div class="text-[11.5px] text-zinc-500 mt-0.5">۴۸ دامنهٔ تبلیغاتی در سطح هسته — بدون مصرف ترافیک</div></div>
      <input id="st-ad" type="checkbox" ${s.adblock ? "checked" : ""} onchange="saveSettings()" class="sr-only peer">
      <span class="w-11 h-6 rounded-full bg-white/10 peer-checked:bg-volt relative transition-colors after:content-[''] after:absolute after:top-0.5 after:right-0.5 after:w-5 after:h-5 after:rounded-full after:bg-zinc-300 after:transition-transform peer-checked:after:-translate-x-5 after:rtl:-translate-x-0 peer-checked:after:translate-x-[-20px] rtl:peer-checked:after:translate-x-[-20px]"></span>
    </label>
    <div class="border-t border-white/[.06] pt-5">
      <div class="text-[13.5px] font-semibold mb-1">حالت پیش‌فرض IP خروجی</div>
      <div class="text-[11.5px] text-zinc-500 mb-3">ثابت = هر کاربر همیشه از یک ماشینِ همان رله خارج می‌شود (پایان نوسان IP)</div>
      <div class="grid grid-cols-2 w-full max-w-xs h-10 rounded-lg bg-volt-bg border border-white/10 overflow-hidden">
        <label class="grid place-items-center text-[12.5px] cursor-pointer ${s.ip_mode !== "fixed" ? "bg-volt/15 text-volt font-semibold" : "text-zinc-400"}"><input type="radio" name="ipm" value="rotate" ${s.ip_mode !== "fixed" ? "checked" : ""} onchange="saveSettings()" class="sr-only">چرخشی 🔁</label>
        <label class="grid place-items-center text-[12.5px] cursor-pointer ${s.ip_mode === "fixed" ? "bg-volt/15 text-volt font-semibold" : "text-zinc-400"}"><input type="radio" name="ipm" value="fixed" ${s.ip_mode === "fixed" ? "checked" : ""} onchange="saveSettings()" class="sr-only">ثابت 📌</label>
      </div>
    </div>
  </div>
  <div class="mt-3 rounded-xl border border-white/[.07] bg-panel p-5">
    <div class="text-[13px] font-bold mb-2">هسته و بک‌اند</div>
    <div class="space-y-2 text-[12px]">
      <div class="flex justify-between"><span class="text-zinc-500">هستهٔ لبه</span><span class="font-mono text-volt">${CORE_ID} · v${fa(VERSION)}</span></div>
      <div class="flex justify-between"><span class="text-zinc-500">بک‌اند Go</span><span class="font-mono">voltd · Golang 1.24</span></div>
      <div class="flex justify-between"><span class="text-zinc-500">معماری</span><span class="font-mono">75% Go · 20% TS · 5% Tailwind</span></div>
    </div>
  </div>`, "تنظیمات");
}

export function terminalHTML(env: Env): string {
  return shell(env, "terminal", `
  <div class="mb-4"><h2 class="text-lg font-extrabold">ترمینال ولت</h2>
  <p class="text-[12.5px] text-zinc-500 mt-1">اتصال مستقیم به بک‌اند Go — همان دستورهای ربات تلگرام اینجا هم کار می‌کنند.</p></div>
  <div class="rounded-xl border border-white/[.07] bg-black/60 overflow-hidden">
    <div class="flex items-center gap-2 px-4 h-9 border-b border-white/[.07] text-[11px] font-mono text-zinc-500">
      <span class="w-2.5 h-2.5 rounded-full bg-red-500/70"></span><span class="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></span><span class="w-2.5 h-2.5 rounded-full bg-green-500/70"></span>
      <span class="ms-2">voltd — go bridge</span><span class="ms-auto text-volt">● live</span>
    </div>
    <div id="tout" class="p-4 h-72 overflow-y-auto text-[12.5px] font-mono leading-6" dir="ltr"></div>
    <form onsubmit="bridgeSend(event)" class="flex border-t border-white/[.07]">
      <span class="grid place-items-center px-3 text-volt font-mono">›</span>
      <input id="cmd" class="flex-1 h-11 bg-transparent px-2 font-mono text-[13px] outline-none" placeholder="/stats" dir="ltr" autocomplete="off">
      <button class="px-5 text-[13px] font-bold text-black bg-volt hover:brightness-110">اجرا</button>
    </form>
  </div>
  <div class="mt-3 text-[11.5px] text-zinc-500">دستورهای موجود: <code class="font-mono text-zinc-300" dir="ltr">/stats · /keys · /newkey · /status · /report · /help</code></div>`, "ترمینال");
}

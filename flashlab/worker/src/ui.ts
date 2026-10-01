// FLASHLAB UI — «میز فرمان فلش» — Tailwind (5%) — flash-ui-lab design language:
// deep navy + amber bolt + glass surfaces + the flash-lab motion set.
// RTL Persian, Vazirmatn, Persian digits everywhere.
import { Env, Key, PanelSettings } from "./types";
import { VERSION, CORE_ID, LOCATIONS, FRAG_PROFILES } from "./consts";
import { Stats } from "./types";

const CSS = "__FL_CSS__";   // ← build script injects compiled Tailwind here

// ── client runtime (plain ES5-ish JS — no backticks inside this literal) ──
const JS_APP = `
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
function clock(){const d=new Date(Date.now()+3.5*3600e3);const t=d.toISOString().substr(11,8);const el=$('#clk');if(el)el.textContent=t+' تهران';}
setInterval(clock,1000);clock();
async function api(p,o){const r=await fetch(p,o);return r.json().catch(()=>({ok:false}))}
function toast(t){const n=document.createElement('div');n.className='fl-toast';n.textContent=t;document.body.appendChild(n);setTimeout(()=>n.remove(),1900)}
async function cp(txt,btn){try{await navigator.clipboard.writeText(txt);toast('کپی شد ✓');if(btn){btn.classList.add('ok');setTimeout(()=>btn.classList.remove('ok'),900)}}catch(e){toast('خطای کپی')}}
window.cp=cp;
// count-up animation (KPI numerals)
function countUp(el){
  const raw=el.dataset.v||'0'; const m=raw.match(/^([\\d.,]+)\\s*(.*)$/);
  if(!m){el.textContent=raw;return}
  const target=parseFloat(m[1].replace(/,/g,'')); const suffix=m[2]||'';
  const t0=performance.now(),dur=900;
  function step(t){const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);
    const v=target*e; const dec=(m[1].indexOf('.')>=0)?1:0;
    el.textContent=fa(v.toFixed(dec).replace(/\\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]))+(suffix?' '+suffix:'');
    if(k<1)requestAnimationFrame(step)}
  requestAnimationFrame(step)}
function fa(x){return String(x).replace(/\\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d])}
window.addEventListener('load',()=>{$$('.count').forEach(countUp)});
// sparkline (traffic trend — canvas, no libs)
async function spark(){
  const c=$('#spark');if(!c)return;const ctx=c.getContext('2d');
  const r=await api('/api/v1/history');const h=r.ok?r.history||[]:[];
  const W=c.width=c.clientWidth*2,H=c.height=c.clientHeight*2;
  ctx.clearRect(0,0,W,H);
  if(h.length<2){ctx.fillStyle='#8b96b3';ctx.font='26px Vazirmatn';ctx.textAlign='center';ctx.fillText('روند مصرف بعد از اولین ساعت ثبت می‌شود',W/2,H/2);return}
  const pts=[];for(let i=1;i<h.length;i++){let d=h[i].bytes-h[i-1].bytes;if(d<0)d=h[i].bytes;pts.push(d)}
  const max=Math.max.apply(null,pts.concat([1]));
  const pad=26;
  ctx.strokeStyle='rgba(245,166,35,.14)';ctx.lineWidth=2;
  for(let g=1;g<4;g++){const y=pad+(H-2*pad)*g/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke()}
  const x=i=>pad+(W-2*pad)*i/(pts.length-1),y=v=>H-pad-(H-2*pad)*v/max;
  const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'rgba(245,166,35,.4)');grad.addColorStop(1,'rgba(245,166,35,0)');
  ctx.beginPath();ctx.moveTo(x(0),H-pad);pts.forEach((v,i)=>ctx.lineTo(x(i),y(v)));ctx.lineTo(x(pts.length-1),H-pad);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));
  ctx.strokeStyle='#f5a623';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
  ctx.beginPath();ctx.arc(x(pts.length-1),y(pts[pts.length-1]),5,0,7);ctx.fillStyle='#f5c26b';ctx.fill();
}
window.spark=spark;window.addEventListener('load',spark);
// live ping (locations)
async function ping(loc,btn){btn.textContent='…';btn.disabled=true;btn.classList.add('anim-blink');
  const r=await api('/api/v1/probe?loc='+loc);btn.classList.remove('anim-blink');
  btn.textContent=r.ok&&r.live&&r.live.ok?fa(r.live.ms)+' م‌ث':'✗ مرده';
  btn.disabled=false;if(r.ok&&r.live&&r.live.ok&&r.live.ms<600)btn.classList.add('ok')}
window.ping=ping;
// radar view
async function radarLoad(){
  const box=$('#radar-rows');if(!box)return;
  box.innerHTML='<div class="h-10 rounded-xl shimmer"></div><div class="h-10 rounded-xl shimmer mt-2"></div>';
  const r=await api('/api/v1/radar');
  if(!r.ok){box.innerHTML='<div class="text-flerr text-sm p-4">خطا در دریافت رادار</div>';return}
  const rows=r.radar||[];
  const el=$('#radar-meta');if(el)el.textContent=rows.length?('آخرین اسکن: '+fa(new Date(r.latest_scan).toLocaleTimeString('fa-IR'))+' · '+fa(r.alive)+' زنده از '+fa(rows.length)):'رادار در حال گرم‌شدن است — اولین اسکن Go چند لحظه دیگر می‌رسد';
  if(!rows.length){box.innerHTML='<div class="p-6 text-flmut text-sm text-center">هنوز داده‌ای نیست — رادار Go هر ۱۰ دقیقه اسکن می‌کند.</div>';return}
  box.innerHTML=rows.map((x,i)=>{
    const loc=LOC_FA[x.loc]||x.loc;
    const st=x.ok?'<span class="text-flok">🟢 زنده</span>':'<span class="text-flerr">⛔ مرده</span>';
    const bar=x.ok?'<div class="h-1.5 rounded-full bg-fl/70" style="width:'+Math.max(6,100-Math.min(95,x.ms/30))+'%"></div>':'<div class="h-1.5 rounded-full bg-flerr/60" style="width:100%"></div>';
    return '<div class="anim-fadeup d'+(i%8+1)+' flex items-center gap-3 px-4 py-2.5 '+(i%2?'bg-white/[.015]':'')+'">'
      +'<span class="w-6 text-center text-[11px] font-mono text-flmut">'+fa(i+1)+'</span>'
      +'<div class="min-w-0 flex-1"><div class="flex items-center gap-2"><span class="text-[13px] font-semibold truncate">'+loc+'</span>'
      +'<code class="text-[10.5px] font-mono text-flmut truncate" dir="ltr">'+x.relay+'</code></div>'
      +'<div class="mt-1.5">'+bar+'</div></div>'
      +'<div class="text-left"><div class="text-[13px] font-bold '+(x.ok?'text-fl':'text-flerr')+' tabular">'+(x.ok?fa(x.ms)+' م‌ث':'—')+'</div>'
      +'<div class="text-[10px]">'+st+'</div></div></div>'}).join('');
}
window.radarLoad=radarLoad;window.addEventListener('load',radarLoad);
// QR modal
function qrShow(uuid,name){const m=$('#qr-modal');$('#qr-title').textContent='فلش — '+name;$('#qr-img').src='/qr/'+uuid+'?frag=mci';m.classList.remove('hidden');m.classList.add('anim-card')}
window.qrShow=qrShow;
function qrHide(){const m=$('#qr-modal');m.classList.add('hidden')}
window.qrHide=qrHide;
// bridge terminal
async function bridgeSend(ev){ev.preventDefault();const i=$('#cmd');const c=i.value.trim();if(!c)return;i.value='';await api('/api/v1/bridge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cmd:c})});termPrint('› '+c,'in')}
let _last=0;
async function termPoll(){const r=await api('/api/v1/bridge?after='+_last);if(r.ok&&r.outbox)for(const m of r.outbox){_last=Math.max(_last,m.id);termPrint(m.text,'out')}}
function termPrint(t,k){const b=$('#tout');if(!b)return;const l=document.createElement('div');l.className='tl '+k;l.textContent=t;b.appendChild(l);b.scrollTop=b.scrollHeight}
setInterval(termPoll,2000);termPoll();
// settings + keys
async function saveSettings(){const s={adblock:$('#st-ad')?.checked?1:0,ip_mode:document.querySelector('input[name=ipm]:checked')?.value||'rotate'};const r=await api('/api/v1/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(s)});toast(r.ok?'ذخیره شد ✓':'خطا')}
window.saveSettings=saveSettings;
async function newKey(ev){ev.preventDefault();const b={name:$('#nk-name').value||'بدون نام',loc:$('#nk-loc').value,quota_gb:+$('#nk-quota').value||0,expiry_days:+$('#nk-days').value||0};const r=await api('/api/v1/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});toast(r.ok?'کلید ساخته شد ✓':'خطا');if(r.ok)setTimeout(()=>location.reload(),700)}
window.newKey=newKey;
async function keyAct(uuid,act,val){const body={};body[act]=val;const r=await api('/api/v1/keys/'+uuid,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});toast(r.ok?'اعمال شد ✓':'خطا');if(act==='del'){if(r.ok)setTimeout(()=>location.reload(),500)}else setTimeout(()=>location.reload(),600)}
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

const BOLT = `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor"/></svg>`;
const NAV: { id: string; fa: string; icon: string }[] = [
  { id: "", fa: "داشبورد", icon: "▦" },
  { id: "radar", fa: "رادار", icon: "◎" },
  { id: "locations", fa: "لوکیشن‌ها", icon: "🛰" },
  { id: "keys", fa: "کلیدها", icon: "🔑" },
  { id: "settings", fa: "تنظیمات", icon: "⚙" },
  { id: "terminal", fa: "ترمینال", icon: "❯_" },
];

// LOC_FA — id→Persian name map for the radar rows (client side)
const LOC_FA_MAP = "{" + LOCATIONS.map((c) => `"${c.id}":"${c.flag} ${c.fa}"`).join(",") + "}";

function shell(env: Env, active: string, inner: string, title: string): string {
  const items = NAV.map((t, i) => {
    const on = t.id === active;
    return `<a href="/app${t.id ? "/" + t.id : ""}" class="side-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-semibold ${on ? "on" : "text-flmut"} anim-fadeup d${i + 1}"><span class="w-5 text-center opacity-80">${t.icon}</span>${t.fa}</a>`;
  }).join("");
  const mobileNav = NAV.map((t) => {
    const on = t.id === active;
    return `<a href="/app${t.id ? "/" + t.id : ""}" class="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold ${on ? "text-fl" : "text-flmut"}"><span class="text-[15px]">${t.icon}</span>${t.fa}</a>`;
  }).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · فلش‌لب</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body class="aurora text-fltext min-h-screen font-sans antialiased">
<div class="fixed inset-0 pointer-events-none grid-overlay opacity-60"></div>
<div class="sm:flex min-h-screen">
  <aside class="hidden sm:flex flex-col w-60 shrink-0 p-4 gap-2 border-s border-flink/60">
    <div class="flex items-center gap-3 px-2 py-3 mb-2">
      <span class="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-fl to-fl2 text-[#1a1204] shadow-glow-lg anim-bolt">${BOLT.replace('w-5 h-5', 'w-6 h-6')}</span>
      <div class="leading-tight"><div class="font-black text-[17px]">فلش <span class="text-fl">آزمایشی</span></div>
      <div class="text-[10px] font-mono text-flmut mt-0.5">${CORE_ID} · Go۷۵٪</div></div>
    </div>
    <nav class="flex flex-col gap-1">${items}</nav>
    <div class="mt-auto rounded-xl glass p-3.5 anim-fadeup d6">
      <div class="flex items-center gap-2 text-[11px] text-flmut"><span class="w-2 h-2 rounded-full bg-flok anim-blink"></span>بک‌اند Go زنده</div>
      <div class="mt-2 flex items-center justify-between text-[10.5px] font-mono text-flmut"><span>BUILD v${fa(VERSION)}</span><span class="text-fl">«صاعقه»</span></div>
    </div>
  </aside>
  <div class="flex-1 min-w-0">
    <header class="sticky top-0 z-40 h-14 border-b border-flink/60 bg-flbg/80 backdrop-blur-md flex items-center gap-3 px-4">
      <div class="sm:hidden grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-fl to-fl2 text-[#1a1204] anim-bolt">${BOLT}</div>
      <div class="font-extrabold text-[15px]">فلش <span class="text-fl">آزمایشی</span><span class="hidden sm:inline text-flmut font-normal text-[12px] mx-2">· ${title}</span></div>
      <div class="ms-auto flex items-center gap-2 text-[11px] font-mono text-flmut">
        <span class="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-flink/70"><span class="w-1.5 h-1.5 rounded-full bg-flok anim-blink"></span>GOCORE</span>
        <span id="clk" class="tabular">--:--:--</span>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 py-6 pb-24 sm:pb-10">${inner}</main>
    <footer class="hidden sm:block fixed bottom-0 inset-x-0 z-40 h-7 border-t border-flink/60 bg-flbg/90 backdrop-blur-md overflow-hidden">
      <div class="marquee-track text-[11px] font-mono text-flmut leading-7 px-4">⚡ فلش‌لب نسل Go — ۷۵٪ Go بک‌اند و ربات · ۲۰٪ TypeScript ورکر · ۵٪ Tailwind ظاهر · رادار همزمان رله‌ها · توربو خودکار · فرگمنت سیم‌کارت · تست سرعت واقعی از دل تونل · پین IP ثابت · 0-RTT</div>
    </footer>
  </div>
</div>
<nav class="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-flink/60 bg-flbg/95 backdrop-blur-md flex justify-around px-1 py-1.5">${mobileNav}</nav>
<script>const LOC_FA=${LOC_FA_MAP};${JS_APP}</script></body></html>`;
}

export function decoyPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Site</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#334;display:grid;place-items:center;min-height:100vh;margin:0}h1{font-size:1.5rem;font-weight:600}</style>
</head><body><div style="text-align:center"><h1>Coming soon</h1><p style="color:#889">This site is under construction.</p></div></body></html>`;
}

// ورود — وفادار به ظاهر flash-ui-lab (کارت شیشه‌ای + صاعقهٔ کهربایی + رمز)
export function loginPage(gate: string, err = ""): string {
  return `<!doctype html><html lang="fa" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>فلش — ورود به پنل آزمایشی</title>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head>
<body class="aurora text-fltext min-h-screen font-sans grid place-items-center antialiased">
<div class="fixed inset-0 pointer-events-none grid-overlay opacity-60"></div>
<div class="relative w-[min(92vw,420px)] anim-card">
  <div class="glass rounded-[24px] p-10 sm:p-9">
    <div class="logo flex items-center gap-3 justify-center mb-2">
      <span class="text-[44px] anim-bolt anim-float">⚡</span>
    </div>
    <h1 class="text-[24px] font-black text-center">فلش | پنل آزمایشی</h1>
    <div class="sub text-[13px] text-flmut text-center mt-1.5 mb-7">برای ورود، رمز پنل را وارد کنید</div>
    <form method="POST" action="/g/${gate}/auth" class="space-y-4">
      <label class="block">
        <span class="block text-[13px] text-fllabel font-bold mb-2">رمز عبور</span>
        <input name="password" type="password" autofocus autocomplete="current-password" placeholder="••••••••"
          class="w-full h-[50px] px-4 rounded-[14px] border-[1.5px] border-flink bg-flinput text-fltext text-[16px] font-sans outline-none transition focus:border-fl focus:shadow-[0_0_0_4px_rgba(245,166,35,.18)]">
      </label>
      <button class="w-full h-[50px] rounded-[14px] bg-gradient-to-l from-fl to-fl2 text-[#1a1204] text-[16px] font-extrabold hover:brightness-110 active:scale-[.98] transition shadow-glow">ورود</button>
    </form>
    <div class="err text-flerr text-[13px] text-center mt-3 min-h-[18px]">${err}</div>
    <div class="foot mt-6 text-center text-[11px] text-flmut/70">🔬 UI فلش‌لب + همهٔ قابلیت‌های بتا (رادار Go · توربو · تست سرعت · فرگمنت)</div>
  </div>
  <div class="mt-5 text-center text-[10.5px] font-mono text-flmut/60">${CORE_ID} · v${fa(VERSION)} «صاعقه» — ۷۵٪ Go · ۲۰٪ TS · ۵٪ Tailwind</div>
</div>
</body></html>`;
}

// ── داشبورد — بنتو KPI + شمارندهٔ متحرک + نمودار روند + معماری ──
export function dashboardHTML(env: Env, stats: Stats, settings: PanelSettings): string {
  const kpi = (label: string, value: string, sub: string, icon: string, d: string, glow = false) => `
  <div class="relative overflow-hidden rounded-2xl glass p-5 anim-card ${d} ${glow ? "border-fl/30" : ""} hover:border-fl/30 transition-colors">
    <div class="flex items-center justify-between mb-3">
      <div class="text-[11.5px] text-flmut font-semibold">${label}</div>
      <span class="text-[17px] ${glow ? "text-fl anim-glow" : "opacity-70"}">${icon}</span>
    </div>
    <div class="count text-[30px] font-black tabular ${glow ? "text-fl" : ""}" data-v="${value}">${fa(0)}</div>
    <div class="text-[11px] text-flmut mt-1.5">${sub}</div>
  </div>`;
  const inner = `
  <div class="relative overflow-hidden rounded-3xl glass p-6 sm:p-7 mb-4 anim-card">
    <span class="speed-line" style="top:22%;right:-40px;animation-delay:0s"></span>
    <span class="speed-line" style="top:55%;right:-60px;animation-delay:.8s"></span>
    <span class="speed-line" style="top:78%;right:-30px;animation-delay:1.6s"></span>
    <div class="flex items-center gap-2.5 text-[13px] text-flmut">
      <span class="w-2.5 h-2.5 rounded-full bg-fl anim-ring"></span>
      هستهٔ Go متصل · <b class="text-fltext">${settings.panel_name || "فلش"} آزمایشی</b> فعال است
    </div>
    <div class="mt-3 text-[26px] sm:text-[30px] font-black leading-snug">پنل نسل <span class="text-fl">صاعقه</span> — قدرت Go، سرعت لبه</div>
    <div class="mt-2.5 text-[13px] text-flmut leading-7 max-w-2xl">رادار همزمان رله‌ها هر ۱۰ دقیقه همهٔ ۲۴ کشور را با گوروتین‌ها می‌سنجد؛ توربو خودش سریع‌ترین رله را برمی‌گزیند و کانفیگ‌ها با فرگمنت سیم‌کارت و 0-RTT ساخته می‌شوند. همین الان از بخش «رادار» زنده‌اش را ببینید.</div>
    <div class="mt-4 flex flex-wrap gap-2">
      <a href="/app/radar" class="h-9 px-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-fl to-fl2 text-[#1a1204] text-[12.5px] font-extrabold hover:brightness-110 active:scale-[.98] transition shadow-glow">◎ رادار زنده</a>
      <a href="/app/keys" class="h-9 px-4 inline-flex items-center rounded-xl border border-flink bg-flinput text-[12.5px] font-bold hover:border-fl/50 hover:text-fl transition">🔑 کلیدها و اشتراک</a>
    </div>
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
    ${kpi("کلیدهای فعال", fa(String(stats.active)) + " از " + fa(String(stats.keys)), "از مجموع کلیدها", "🔑", "d1", true)}
    ${kpi("آنلاین (۵ دقیقه)", String(stats.online), "اتصال زندهٔ تونل", "🟢", "d2")}
    ${kpi("مصرف امروز", fmtBytes(stats.trafficToday), "ترافیک عبوری امروز", "📥", "d3")}
    ${kpi("لوکیشن‌ها", String(stats.locations), "رله‌های تأییدشدهٔ زنده", "🛰", "d4")}
  </div>
  <div class="grid lg:grid-cols-3 gap-3 mt-3">
    <div class="rounded-2xl glass p-5 lg:col-span-2 anim-card d5">
      <div class="flex items-center justify-between mb-3">
        <div class="text-[13.5px] font-bold">روند مصرف (۲۴ ساعت اخیر)</div>
        <div class="text-[10.5px] font-mono text-flmut">hourly · Go history</div>
      </div>
      <canvas id="spark" class="w-full h-36"></canvas>
    </div>
    <div class="rounded-2xl glass p-5 anim-card d6">
      <div class="text-[13.5px] font-bold mb-3">وضعیت سیستم</div>
      <div class="space-y-2.5 text-[12px]">
        <div class="flex justify-between"><span class="text-flmut">نسخه</span><span class="font-mono">v${fa(VERSION)} «صاعقه»</span></div>
        <div class="flex justify-between"><span class="text-flmut">هسته</span><span class="font-mono text-fl">${CORE_ID}</span></div>
        <div class="flex justify-between"><span class="text-flmut">ضد تبلیغ</span><span>${settings.adblock ? "روشن 🛡" : "خاموش"}</span></div>
        <div class="flex justify-between"><span class="text-flmut">حالت IP</span><span>${settings.ip_mode === "fixed" ? "ثابت 📌" : "چرخشی 🔁"}</span></div>
        <div class="flex justify-between"><span class="text-flmut">مصرف کل</span><span class="tabular">${fa(fmtBytes(stats.lifetimeBytes))}</span></div>
      </div>
    </div>
  </div>
  <div class="rounded-2xl glass p-5 mt-3 anim-card d7">
    <div class="text-[13.5px] font-bold mb-3">معماری نسل جدید — سهم واقعی زبان‌ها</div>
    <div class="grid sm:grid-cols-3 gap-3">
      <div class="rounded-xl border border-fl/25 bg-fl/[.05] p-4">
        <div class="flex items-baseline gap-2"><span class="text-[22px] font-black text-fl font-mono">۷۵٪</span><span class="text-[12.5px] font-bold">Go</span></div>
        <div class="text-[11.5px] text-flmut mt-1.5 leading-6">بک‌اند و ربات — رادار همزمان، تست سرعت واقعی، پل تلگرام، دیپلوی و خزانه (پروسهٔ <code class="font-mono text-fl">flashd</code>)</div>
      </div>
      <div class="rounded-xl border border-flink p-4">
        <div class="flex items-baseline gap-2"><span class="text-[22px] font-black font-mono">۲۰٪</span><span class="text-[12.5px] font-bold">TypeScript</span></div>
        <div class="text-[11.5px] text-flmut mt-1.5 leading-6">ورکر لبه — تونل VLESS با 0-RTT، موتور رله و توربو، اشتراک ۴ فرمته و API روی کلادفلر</div>
      </div>
      <div class="rounded-xl border border-flink p-4">
        <div class="flex items-baseline gap-2"><span class="text-[22px] font-black font-mono">۵٪</span><span class="text-[12.5px] font-bold">Tailwind CSS</span></div>
        <div class="text-[11.5px] text-flmut mt-1.5 leading-6">ظاهر پنل — همین رابط شیشه‌ای با انیمیشن‌های زنده و راست‌چین فارسی</div>
      </div>
    </div>
  </div>`;
  return shell(env, "", inner, "داشبورد");
}

// ── رادار — اسکنر همزمان Go با جاروب زنده ──
export function radarHTML(env: Env): string {
  return shell(env, "radar", `
  <div class="mb-4 flex flex-wrap items-end gap-3">
    <div>
      <h2 class="text-[19px] font-black">رادار رله‌ها <span class="text-fl font-mono text-[12px]">goroutines</span></h2>
      <p class="text-[12.5px] text-flmut mt-1.5 leading-6 max-w-xl">هر ۱۰ دقیقه، بک‌اند Go همهٔ رله‌های همهٔ کشورها را همزمان می‌سنجد — هندشیک واقعی TLS با SNI کلودفلر از دل رله (نه فقط پینگ TCP). توربو کلیدها از همین جدول، سریع‌ترین رله را برمی‌گزیند.</p>
    </div>
    <button onclick="radarLoad()" class="ms-auto h-10 px-4 rounded-xl bg-gradient-to-l from-fl to-fl2 text-[#1a1204] text-[12.5px] font-extrabold hover:brightness-110 active:scale-[.98] transition shadow-glow">↻ تازه‌سازی</button>
  </div>
  <div class="grid lg:grid-cols-[300px_1fr] gap-3">
    <div class="rounded-2xl glass p-6 flex flex-col items-center anim-card d1">
      <div class="radar-disc w-40 h-40 anim-glow"><div class="radar-grid"></div></div>
      <div id="radar-meta" class="mt-5 text-[11.5px] text-flmut text-center leading-6">در حال دریافت…</div>
      <div class="mt-3 text-[10.5px] font-mono text-flmut/70 text-center">SNI probe: cp.cloudflare.com<br>concurrency: 12 · every 10m</div>
    </div>
    <div class="rounded-2xl glass overflow-hidden anim-card d2">
      <div class="px-4 py-3 border-b border-flink/60 text-[12.5px] font-bold flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-fl anim-blink"></span>جدول رله‌ها — مرتب بر اساس تأخیر
      </div>
      <div id="radar-rows" class="divide-y divide-flink/40 max-h-[560px] overflow-y-auto"></div>
    </div>
  </div>`, "رادار");
}

// ── لوکیشن‌ها — کارت‌های کشور با پینگ زنده ──
export function locationsHTML(env: Env): string {
  const groups: Record<string, string> = { me: "نزدیک‌ترین به ایران", eu: "اروپا", asia: "آسیا", am: "آمریکا", oc: "اقیانوسیه" };
  const sections = Object.entries(groups).map(([cont, label], gi) => {
    const list = LOCATIONS.filter((c) => c.cont === cont);
    if (!list.length) return "";
    const cards = list.map((c, i) => `
      <div class="relative overflow-hidden rounded-2xl glass p-4 anim-card d${(i % 8) + 1} hover:border-fl/30 transition-colors">
        <div class="flex items-center gap-2.5">
          <span class="text-[26px]">${c.flag}</span>
          <div class="min-w-0 flex-1">
            <div class="font-bold text-[14px]">${c.fa} <span class="text-flmut/70 font-mono text-[10px]">${c.id.toUpperCase()}</span></div>
            <div class="text-[11px] text-flmut truncate mt-0.5">${c.city}</div>
          </div>
          ${c.p80 ? '<span class="px-1.5 py-0.5 rounded-md bg-fl/15 text-fl text-[9.5px] font-mono">80+443</span>' : ""}
        </div>
        <div class="text-[11px] text-flmut mt-2.5 leading-5 min-h-[2.2em]">${c.note}</div>
        <div class="flex items-center gap-2 mt-3">
          <span class="text-[10.5px] font-mono text-flmut">${fa(c.relays.length)} رله</span>
          <button onclick="ping('${c.id}',this)" class="ms-auto h-8 px-3.5 rounded-lg border border-flink bg-flinput text-[11.5px] font-bold hover:border-fl/50 hover:text-fl transition">تست پینگ</button>
        </div>
      </div>`).join("");
    return `<div class="mt-5"><div class="text-[12px] font-bold text-flmut mb-2.5">${label}</div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards}</div></div>`;
  }).join("");
  return shell(env, "locations", `
  <div class="mb-2">
    <h2 class="text-[19px] font-black">لوکیشن‌ها — ${fa(24)} کشور تأییدشده</h2>
    <p class="text-[12.5px] text-flmut mt-1.5 leading-6 max-w-2xl">ترافیک سایت‌های پشت کلودفلر (بیشتر وب) از رلهٔ همان کشور خارج می‌شود؛ سایت‌های دیگر (گوگل، تلگرام، نتفلیکس…) از مسیر مستقیم پرسرعت می‌روند. برای هر کلید از بخش کلیدها انتخاب کنید.</p>
  </div>${sections}`, "لوکیشن‌ها");
}

// ── کلیدها — کارت‌های کامل با QR + فرگمنت + توربو ──
export function keysHTML(env: Env, keys: Key[], host: string): string {
  const cards = keys.map((k, ki) => {
    const usedPct = k.quota_gb > 0 ? Math.min(100, (k.used_bytes / (k.quota_gb * 1024 ** 3)) * 100) : 0;
    const expired = k.expiry_ms > 0 && k.expiry_ms < Date.now();
    const subBase = `https://${host}/sub/${k.uuid}`;
    const locOpts = [`<option value="">بدون لوکیشن</option>`, ...LOCATIONS.map((c) => `<option value="${c.id}" ${k.loc === c.id ? "selected" : ""}>${c.flag} ${c.fa}</option>`)].join("");
    return `
  <div class="rounded-2xl glass p-5 mb-3 anim-card d${(ki % 8) + 1}">
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <span class="font-extrabold text-[15.5px]">${k.name}</span>
      <span class="px-2 py-0.5 rounded-md text-[10.5px] font-mono ${k.status === "active" && !expired ? "bg-fl/15 text-fl" : "bg-flerr/15 text-flerr"}">${k.status === "active" && !expired ? "فعال" : "غیرفعال"}</span>
      ${k.ip_mode === "fixed" ? '<span class="px-2 py-0.5 rounded-md text-[10.5px] bg-white/5 text-flmut">IP ثابت 📌</span>' : ""}
      ${k.turbo ? '<span class="px-2 py-0.5 rounded-md text-[10.5px] bg-fl/15 text-fl font-bold anim-glow">توربو 🚀</span>' : ""}
      ${k.adblock ? '<span class="px-2 py-0.5 rounded-md text-[10.5px] bg-white/5 text-flmut">ضدتبلیغ 🛡</span>' : ""}
      <button onclick="qrShow('${k.uuid}','${k.name.replace(/'/g, "")}')" class="ms-auto h-8 px-3 rounded-lg border border-fl/40 text-fl text-[11.5px] font-bold hover:bg-fl/10 transition">QR</button>
      <button onclick="delKey('${k.uuid}')" class="h-8 px-3 rounded-lg border border-flerr/25 text-flerr text-[11.5px] hover:bg-flerr/10 transition-colors">حذف</button>
    </div>
    <div class="text-[11px] font-mono text-flmut mb-3 truncate" dir="ltr">${k.uuid}</div>
    ${k.quota_gb > 0 ? `
    <div class="h-1.5 rounded-full bg-flinput overflow-hidden mb-1.5"><div class="h-full bg-gradient-to-l from-fl to-fl2 rounded-full transition-all" style="width:${usedPct.toFixed(1)}%"></div></div>
    <div class="text-[11px] text-flmut mb-3">${fa(fmtBytes(k.used_bytes))} از ${fa(k.quota_gb)} گیگابایت</div>` : `
    <div class="text-[11px] text-flmut mb-3">مصرف: ${fa(fmtBytes(k.used_bytes))} · نامحدود</div>`}
    <div class="grid sm:grid-cols-3 gap-3 mb-3">
      <label class="block"><span class="text-[11px] text-flmut">لوکیشن</span>
        <select onchange="keyAct('${k.uuid}','loc',this.value)" class="mt-1 w-full h-9 rounded-lg bg-flinput border border-flink px-2 text-[12.5px] focus:border-fl/50 outline-none">${locOpts}</select></label>
      <label class="block"><span class="text-[11px] text-flmut">حالت IP</span>
        <div class="mt-1 grid grid-cols-2 h-9 rounded-lg bg-flinput border border-flink overflow-hidden">
          <button onclick="keyAct('${k.uuid}','ip_mode','rotate')" class="text-[12px] ${k.ip_mode !== "fixed" ? "bg-fl/15 text-fl font-bold" : "text-flmut"}">چرخشی</button>
          <button onclick="keyAct('${k.uuid}','ip_mode','fixed')" class="text-[12px] ${k.ip_mode === "fixed" ? "bg-fl/15 text-fl font-bold" : "text-flmut"}">ثابت</button>
        </div></label>
      <label class="block"><span class="text-[11px] text-flmut">توربو (رادار Go)</span>
        <div class="mt-1 grid grid-cols-2 h-9 rounded-lg bg-flinput border ${k.turbo ? "border-fl/50" : "border-flink"} overflow-hidden">
          <button onclick="keyAct('${k.uuid}','turbo',1)" class="text-[12px] ${k.turbo ? "bg-fl/15 text-fl font-bold" : "text-flmut"}">روشن 🚀</button>
          <button onclick="keyAct('${k.uuid}','turbo',0)" class="text-[12px] ${!k.turbo ? "bg-white/5 text-fltext" : "text-flmut"}">خاموش</button>
        </div></label>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-[11px] text-flmut me-1">لینک اشتراک:</span>
      <button onclick="cp('${subBase}?format=base64&frag=mci',this)" class="h-8 px-3 rounded-lg border border-flink bg-flinput text-[11.5px] hover:border-fl/50 hover:text-fl transition">v2rayNG</button>
      <button onclick="cp('${subBase}?format=xjson&frag=mci',this)" class="h-8 px-3 rounded-lg border border-flink bg-flinput text-[11.5px] hover:border-fl/50 hover:text-fl transition">Xray کامل</button>
      <button onclick="cp('${subBase}?format=singbox',this)" class="h-8 px-3 rounded-lg border border-flink bg-flinput text-[11.5px] hover:border-fl/50 hover:text-fl transition">sing-box</button>
      <button onclick="cp('${subBase}?format=clash',this)" class="h-8 px-3 rounded-lg border border-flink bg-flinput text-[11.5px] hover:border-fl/50 hover:text-fl transition">Clash</button>
      <button onclick="cp('${subBase}',this)" class="h-8 px-3 rounded-lg bg-gradient-to-l from-fl to-fl2 text-[#1a1204] text-[11.5px] font-extrabold hover:brightness-110">کپی لینک خام</button>
    </div>
  </div>`;
  }).join("") || `<div class="rounded-2xl border border-dashed border-flink p-12 text-center text-flmut text-sm anim-card">هنوز کلیدی ساخته نشده — اولین کلید را بسازید ⚡</div>`;

  const fragRows = Object.entries(FRAG_PROFILES).map(([id, p]) => `<div class="flex justify-between px-4 py-2.5 text-[12.5px]"><span>${p.label}</span><code class="font-mono text-fl" dir="ltr">?frag=${id}</code></div>`).join("");

  return shell(env, "keys", `
  <div class="mb-4">
    <h2 class="text-[19px] font-black">کلیدها و اشتراک</h2>
    <p class="text-[12.5px] text-flmut mt-1.5 leading-6 max-w-2xl">هر کلید = یک اشتراک کامل با تمام فرمت‌ها + QR اسکن‌پذیر. توربو روشن = رله‌ها به ترتیب سرعت واقعیِ اندازه‌گیری‌شده توسط رادار Go امتحان می‌شوند.</p>
  </div>
  <details class="rounded-2xl border border-fl/25 bg-fl/[.05] p-5 mb-4 anim-card">
    <summary class="cursor-pointer text-[13px] font-extrabold">＋ ساخت کلید جدید</summary>
    <form onsubmit="newKey(event)" class="grid sm:grid-cols-4 gap-3 mt-4">
      <label class="block"><span class="text-[11px] text-flmut">نام</span><input id="nk-name" class="mt-1 w-full h-9 rounded-lg bg-flinput border border-flink px-2.5 text-[13px] focus:border-fl/50 outline-none" placeholder="مثلاً: گوشی من"></label>
      <label class="block"><span class="text-[11px] text-flmut">لوکیشن</span><select id="nk-loc" class="mt-1 w-full h-9 rounded-lg bg-flinput border border-flink px-2 text-[12.5px]"><option value="">بدون لوکیشن</option>${LOCATIONS.map((c) => `<option value="${c.id}">${c.flag} ${c.fa}</option>`).join("")}</select></label>
      <label class="block"><span class="text-[11px] text-flmut">حجم (GB)</span><input id="nk-quota" type="number" min="0" class="mt-1 w-full h-9 rounded-lg bg-flinput border border-flink px-2.5 text-[13px] focus:border-fl/50 outline-none" placeholder="0 = نامحدود"></label>
      <label class="block"><span class="text-[11px] text-flmut">اعتبار (روز)</span><input id="nk-days" type="number" min="0" class="mt-1 w-full h-9 rounded-lg bg-flinput border border-flink px-2.5 text-[13px] focus:border-fl/50 outline-none" placeholder="0 = نامحدود"></label>
      <button class="sm:col-span-4 h-10 rounded-xl bg-gradient-to-l from-fl to-fl2 text-[#1a1204] font-extrabold text-[13.5px] hover:brightness-110 active:scale-[.99] transition shadow-glow">ساخت کلید ⚡</button>
    </form>
  </details>
  ${cards}
  <div class="mt-6 rounded-2xl glass divide-y divide-flink/40 anim-card d3">
    <div class="px-4 py-3 text-[13px] font-extrabold">✂ پروفایل‌های فرگمنت هر سیم‌کارت</div>${fragRows}
  </div>
  <div id="qr-modal" class="hidden fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm grid place-items-center p-4" onclick="qrHide()">
    <div class="glass rounded-3xl p-6 text-center max-w-[320px] w-full" onclick="event.stopPropagation()">
      <div id="qr-title" class="font-extrabold text-[15px] mb-4"></div>
      <div class="rounded-2xl bg-white p-3 inline-block anim-fadeup"><img id="qr-img" alt="QR" class="w-56 h-56 block"></div>
      <div class="text-[11.5px] text-flmut mt-4 leading-6">در v2rayNG: + ← «اسکن از QR» — کانفیگ مستقیم وارد می‌شود</div>
      <button onclick="qrHide()" class="mt-4 h-9 px-5 rounded-xl border border-flink bg-flinput text-[12.5px] font-bold hover:border-fl/50 transition">بستن</button>
    </div>
  </div>`, "کلیدها");
}

// ── تنظیمات ──
export function settingsHTML(env: Env, s: PanelSettings): string {
  return shell(env, "settings", `
  <div class="mb-4">
    <h2 class="text-[19px] font-black">تنظیمات</h2>
    <p class="text-[12.5px] text-flmut mt-1.5">پیش‌فرض‌های پنل — هر کلید می‌تواند شخصی‌سازی خودش را داشته باشد.</p>
  </div>
  <div class="rounded-2xl glass p-5 space-y-5 anim-card">
    <label class="flex items-center justify-between gap-4 cursor-pointer">
      <div><div class="text-[13.5px] font-bold">مسدودسازی تبلیغات و ردیاب‌ها</div>
      <div class="text-[11.5px] text-flmut mt-1">۴۸ دامنهٔ تبلیغاتی در سطح هسته — بدون مصرف ترافیک</div></div>
      <input id="st-ad" type="checkbox" ${s.adblock ? "checked" : ""} onchange="saveSettings()" class="sr-only peer">
      <span class="w-11 h-6 rounded-full bg-flink peer-checked:bg-fl relative transition-colors after:content-[''] after:absolute after:top-0.5 after:right-0.5 after:w-5 after:h-5 after:rounded-full after:bg-fltext after:transition-transform peer-checked:after:translate-x-[-20px]"></span>
    </label>
    <div class="border-t border-flink/50 pt-5">
      <div class="text-[13.5px] font-bold mb-1.5">حالت پیش‌فرض IP خروجی</div>
      <div class="text-[11.5px] text-flmut mb-3">ثابت = هر کاربر همیشه از یک ماشینِ همان رله خارج می‌شود (پایان نوسان IP)</div>
      <div class="grid grid-cols-2 w-full max-w-xs h-10 rounded-lg bg-flinput border border-flink overflow-hidden">
        <label class="grid place-items-center text-[12.5px] cursor-pointer ${s.ip_mode !== "fixed" ? "bg-fl/15 text-fl font-bold" : "text-flmut"}"><input type="radio" name="ipm" value="rotate" ${s.ip_mode !== "fixed" ? "checked" : ""} onchange="saveSettings()" class="sr-only">چرخشی 🔁</label>
        <label class="grid place-items-center text-[12.5px] cursor-pointer ${s.ip_mode === "fixed" ? "bg-fl/15 text-fl font-bold" : "text-flmut"}"><input type="radio" name="ipm" value="fixed" ${s.ip_mode === "fixed" ? "checked" : ""} onchange="saveSettings()" class="sr-only">ثابت 📌</label>
      </div>
    </div>
  </div>
  <div class="mt-3 rounded-2xl glass p-5 anim-card d2">
    <div class="text-[13px] font-extrabold mb-2.5">هسته و بک‌اند</div>
    <div class="space-y-2 text-[12px]">
      <div class="flex justify-between"><span class="text-flmut">هستهٔ لبه</span><span class="font-mono text-fl">${CORE_ID} · v${fa(VERSION)} «صاعقه»</span></div>
      <div class="flex justify-between"><span class="text-flmut">بک‌اند Go</span><span class="font-mono">flashd · Golang 1.24 · رادار ۱۰دقیقه</span></div>
      <div class="flex justify-between"><span class="text-flmut">معماری</span><span class="font-mono">۷۵٪ Go · ۲۰٪ TS · ۵٪ Tailwind</span></div>
      <div class="flex justify-between"><span class="text-flmut">گیت‌هاب</span><span class="font-mono text-fl" dir="ltr">FlashPanel (flashlab/)</span></div>
    </div>
  </div>`, "تنظیمات");
}

// ── ترمینال — پل مستقیم به بک‌اند Go ──
export function terminalHTML(env: Env): string {
  return shell(env, "terminal", `
  <div class="mb-4">
    <h2 class="text-[19px] font-black">ترمینال فلش</h2>
    <p class="text-[12.5px] text-flmut mt-1.5">اتصال مستقیم به بک‌اند Go — همان دستورهای ربات تلگرام اینجا هم کار می‌کنند.</p>
  </div>
  <div class="rounded-2xl glass overflow-hidden anim-card">
    <div class="flex items-center gap-2 px-4 h-10 border-b border-flink/60 text-[11px] font-mono text-flmut">
      <span class="w-3 h-3 rounded-full bg-flerr/70"></span><span class="w-3 h-3 rounded-full bg-fl/70"></span><span class="w-3 h-3 rounded-full bg-flok/70"></span>
      <span class="ms-2">flashd — go bridge</span><span class="ms-auto text-fl anim-blink">● live</span>
    </div>
    <div id="tout" class="p-4 h-80 overflow-y-auto text-[12.5px] font-mono leading-7" dir="ltr"></div>
    <form onsubmit="bridgeSend(event)" class="flex border-t border-flink/60">
      <span class="grid place-items-center px-3 text-fl font-mono">›</span>
      <input id="cmd" class="flex-1 h-12 bg-transparent px-2 font-mono text-[13px] outline-none text-fltext" placeholder="/stats" dir="ltr" autocomplete="off">
      <button class="px-6 text-[13px] font-extrabold text-[#1a1204] bg-gradient-to-l from-fl to-fl2 hover:brightness-110">اجرا</button>
    </form>
  </div>
  <div class="mt-3 text-[11.5px] text-flmut leading-7">دستورهای موجود: <code class="font-mono text-fltext" dir="ltr">/stats · /keys · /newkey · /radar live · /best · /speed &lt;uuid&gt; · /turbo &lt;uuid&gt; on · /status · /report · /trend · /help</code></div>`, "ترمینال");
}

// VOLT worker — upstream dial engine
// v1.0.1 «تپش» — the FLASH-CORE-proven routing model (the v1.0.0 port bug:
// location keys rode the country relay for EVERY target — killing Google/
// YouTube TLS (pools are CF-SNI-only) and every port-80 target; and
// CF-hosted targets outside the suffix list (cp.cloudflare.com — the v2rayNG
// ping URL!) dialed direct and died, because workers cannot connect() to CF).
//   ORDER: adblock → telegram DC direct → CF-hosted via (loc relay →
//   proxyip chain → port-80 IT fallback) → DIRECT (fast worker egress)
// CF-hosted detection: suffix fast-path + IP-literal CF ranges + DoH resolve
// + CF ranges (10-min cache; non-CF giants skipped — YouTube chunk hosts
// would otherwise pay a DNS lookup on every fresh subdomain).
// + STICKY EXIT IP pin engine (ip_mode=fixed — consistent min-hash per user)
import { connect } from "cloudflare:sockets";
import { Env, Key } from "./types";
import { DEFAULT_PROXYIP, PORT80_FALLBACK, CF_RANGES, isCfHosted, dohSkip, isIpV4, isTgDcIp, hostInAdList, locById } from "./consts";
import { getSetting, radarLatencyMap } from "./db";

type AnySocket = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): void };
type Socket = AnySocket;

function dial(addr: string, timeoutMs = 4000): Promise<Socket> {
  // VERIFIED dial (the FLASH dialVerified lesson): connect() returns the
  // Socket synchronously but opens LAZILY — awaiting `opened` proves the TCP
  // connection actually established. Without it a dead relay "succeeds" and
  // the tunnel pipes into a black hole instead of trying the next candidate
  // (v1.0.1 first-cut bug: port-80 CF targets never reached the IT fallback).
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("dial-timeout")), timeoutMs);
    let s: Socket;
    try {
      s = connect(addr, { secureTransport: "off", allowHalfOpen: false } as never) as unknown as Socket;
    } catch (e) { clearTimeout(t); rej(e as Error); return; }
    const opened = (s as unknown as { opened?: Promise<void> }).opened;
    if (opened && typeof opened.then === "function") {
      opened.then(() => { clearTimeout(t); res(s); }, (e: unknown) => { clearTimeout(t); rej(e as Error); });
    } else { clearTimeout(t); res(s); }
  });
}

// ── DoH resolve (for relay family hostnames → pool of IPs) ──
const DOH_CACHE = new Map<string, { ips: string[]; t: number }>();
async function dohResolve(host: string): Promise<string[]> {
  const hit = DOH_CACHE.get(host);
  if (hit && Date.now() - hit.t < 300000) return hit.ips;
  try {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`, {
      headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(2500),
    }).then((x) => x.json() as Promise<{ Answer?: { data: string }[] }>);
    const ips = (r.Answer || []).map((a) => a.data).filter((x) => isIpV4(x));
    DOH_CACHE.set(host, { ips, t: Date.now() });
    return ips;
  } catch (e) { return []; }
}

// ── CF-hosted TARGET detection (v1.0.1): suffix fast-path → IP ranges → DoH ──
function ipToLong(ip: string): number | null {
  const m = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return (((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0);
}
function cidrToPair(cidr: string): [number, number] | null {
  const [ip, bitsS] = cidr.split("/");
  const base = ipToLong(ip);
  const bits = Number(bitsS);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const size = bits === 0 ? 4294967295 : (2 ** (32 - bits) - 1) >>> 0;
  return [base, (base + size) >>> 0];
}
const CF_PAIRS: [number, number][] = CF_RANGES.map(cidrToPair).filter((p): p is [number, number] => !!p);
export function ipInCfRanges(ip: string): boolean {
  const n = ipToLong(ip);
  if (n === null) return false;
  for (const [a, b] of CF_PAIRS) if (n >= a && n <= b) return true;
  return false;
}
// target resolver — cloudflare-dns.com FIRST (fetch() to CF hosts works from
// workers; only raw connect() is CF-blocked), dns.google as backup
async function resolveTargetIps(host: string): Promise<string[]> {
  const hit = DOH_CACHE.get("t:" + host);
  if (hit && Date.now() - hit.t < 600000) return hit.ips;
  let ips: string[] = [];
  for (const doh of ["cloudflare-dns.com/dns-query", "dns.google/resolve"]) {
    try {
      const r = await fetch(`https://${doh}?name=${encodeURIComponent(host)}&type=A`, {
        headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(2200),
      });
      if (r.ok) {
        const j = await r.json() as { Answer?: { type?: number; data: string }[] };
        ips = (j.Answer || []).filter((a) => a.type === 1).map((a) => a.data).filter(isIpV4);
        if (ips.length) break;
      }
    } catch (e) { /* next resolver */ }
  }
  if (ips.length) {
    DOH_CACHE.set("t:" + host, { ips, t: Date.now() });
    if (DOH_CACHE.size > 400) DOH_CACHE.clear();
  }
  return ips;
}
export async function isCfTarget(host: string): Promise<boolean> {
  if (isIpV4(host)) return ipInCfRanges(host);        // IP-literal → range check, zero cost
  if (isCfHosted(host)) return true;                   // suffix fast-path (workers.dev, cloudflare.com…)
  if (dohSkip(host)) return false;                     // provably non-CF giants (Google/YouTube/…)
  try {
    const ips = await resolveTargetIps(host);          // general case: DoH + ranges
    return ips.some((x) => ipInCfRanges(x));
  } catch (e) { return false; }                        // DoH down → fail-open to direct
}

// ── STICKY EXIT IP (ip_mode=fixed): consistent min-hash over (uuid, host) ──
// relay family hostnames are DNS pools that round-robin machines — without a
// pin the exit IP changes every second (the نوسان complaint). Deterministic
// across isolates, stable under DNS reordering, spreads users across the pool.
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
function avalanche(x: number): number {
  x = ((x >>> 16) ^ x) * 0x45d9f3b; x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b; x = Math.imul(x, 0x45d9f3b) >>> 0;
  return ((x >>> 16) ^ x) >>> 0;
}
function pinPoolMachine(uuid: string, host: string, ips: string[]): string {
  if (!ips.length) return host;
  let best = ips[0], bestScore = Infinity;
  for (const ip of ips) {
    const score = avalanche(hashStr(uuid + "|" + ip)) ^ hashStr(ip);
    if (score < bestScore) { bestScore = score; best = ip; }
  }
  return best;
}

export interface DialResult { socket: Socket; via: string }

export async function connectTarget(env: Env, key: Key, host: string, port: number): Promise<DialResult> {
  // (0) ad & tracker refusal — suffix match first, zero cost for normal traffic
  if (!isIpV4(host) && hostInAdList(host)) {
    const on = key.adblock === 1 && (await getSetting(env, "adblock", "1")) !== "0";
    if (on) throw new Error("ADBLOCK " + host);
  }

  // (0.5) telegram MTProto DCs NEVER ride a relay (workers connect directly)
  if (isIpV4(host) && isTgDcIp(host)) {
    return { socket: await dial(`${host}:${port || 443}`), via: "tgd" };
  }

  // relay port follows the target family: TLS 443 (SNI routing) / plain 80
  // (Host-header routing — the proven ProxyIP oracle behavior)
  const relayFor = async (hostList: string[], tag: string, tport: number): Promise<DialResult | null> => {
    const rport = tport === 80 ? 80 : 443;
    // TURBO (v1.0.0 «صاعقه»): reorder the candidates by the Go radar's measured
    // latency (alive relays first, fastest first). The radar table is written
    // by flashd's concurrent scanner every 10 minutes — the worker just reads
    // it, so this costs one cached D1 read and zero probe latency.
    let candidates = hostList;
    if (key.turbo === 1 && hostList.length > 1) {
      const lm = await radarLatencyMap(env);
      if (lm.size) {
        const known: string[] = [];
        const unknown: string[] = [];
        for (const h of hostList) (lm.has(h) ? known : unknown).push(h);
        known.sort((a, b) => (lm.get(a) || 0) - (lm.get(b) || 0));
        candidates = [...known, ...unknown];
      }
    }
    for (const h of candidates) {
      let dialHost = h;
      if (!isIpV4(h)) {
        const ips = await dohResolve(h);
        if (ips.length) {
          dialHost = key.ip_mode === "fixed" ? pinPoolMachine(key.uuid, h, ips) : ips[Math.floor(Math.random() * ips.length)];
        }
      }
      try {
        const s = await dial(`${dialHost}:${rport}`, 2800);
        return { socket: s, via: tag };
      } catch (e) { /* next candidate */ }
    }
    return null;
  };

  // (1) CF-hosted target? — computed ONCE, reused by the relay stages below.
  //     (the v1.0.0 bug: only a tiny suffix list was checked, so
  //     cp.cloudflare.com — the v2rayNG ping URL — dialed DIRECT and died)
  const cfTarget = await isCfTarget(host);

  if (cfTarget) {
    // (1a) location exit — the user picked a country: its relay carries the
    //      CF-hosted traffic (fixed-country exit). PORT-80 rule: only
    //      DUAL-PORT-VERIFIED dedicated relays (p80) may carry plain-HTTP CF
    //      targets — pool machines are SNI/TLS-only and some accept-:80-
    //      without-forwarding (a black hole no dial can detect). All loc
    //      relays dead → graceful fall-through to the global bridge (1b).
    if (key.loc) {
      const c = locById(key.loc);
      if (c && c.relays.length && (port !== 80 || c.p80)) {
        const r = await relayFor(c.relays, "loc:" + c.id, port);
        if (r) return r;
      }
    }
    // (1b) global bridge. 443: admin proxyip → default pool (SNI forwarding
    //      is the pools' core function — verified 24/24 live). 80: admin's
    //      explicit proxyip (their choice, their responsibility) → the
    //      VERIFIED dual-port IT relays (deterministic — never a pool lottery).
    const pip = await getSetting(env, "proxyip", "");
    if (port === 80) {
      const cands = [...(pip && pip !== "off" && pip !== DEFAULT_PROXYIP ? [pip] : []), ...PORT80_FALLBACK];
      const r = await relayFor(cands, "proxyip", port);
      if (r) return r;
    } else {
      const cands = [pip && pip !== "off" ? pip : DEFAULT_PROXYIP, DEFAULT_PROXYIP].filter((x, i, a) => x && a.indexOf(x) === i);
      const r = await relayFor(cands, "proxyip", port);
      if (r) return r;
    }
  }

  // (2) everything else — DIRECT via the worker's own egress (fast; Google,
  //     Telegram, Netflix, Steam… all live here. Community relays are
  //     CF-SNI pass-throughs and would KILL non-CF TLS handshakes)
  return { socket: await dial(`${host}:${port}`), via: "direct" };
}

// quick TCP reachability probe (health card)
export async function checkTcp(host: string, port: number, timeoutMs = 2600): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  try { await dial(`${host}:${port}`, timeoutMs); return { ok: true, ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, ms: Date.now() - t0 }; }
}

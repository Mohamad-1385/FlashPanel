// VOLT worker — upstream dial engine
// Ported (simplified, correct) from the live FLASH CORE connectTarget:
//   adblock → telegram DC direct → CF-hosted via relay → location relay → direct
// + STICKY EXIT IP pin engine (ip_mode=fixed — consistent min-hash per user)
import { connect } from "cloudflare:sockets";
import { Env, Key } from "./types";
import { DEFAULT_PROXYIP, isCfHosted, isIpV4, isTgDcIp, hostInAdList, locById } from "./consts";
import { getSetting } from "./db";

type AnySocket = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): void };
type Socket = AnySocket;

function dial(addr: string, timeoutMs = 4000): Promise<Socket> {
  // workers-types: connect() returns the Socket synchronously (opens lazily)
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("dial-timeout")), timeoutMs);
    try {
      const s = connect(addr, { secureTransport: "off", allowHalfOpen: false } as never) as unknown as Socket;
      clearTimeout(t);
      res(s);
    } catch (e) { clearTimeout(t); rej(e as Error); }
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
    for (const h of hostList) {
      let dialHost = h;
      if (!isIpV4(h)) {
        const ips = await dohResolve(h);
        if (ips.length) {
          dialHost = key.ip_mode === "fixed" ? pinPoolMachine(key.uuid, h, ips) : ips[Math.floor(Math.random() * ips.length)];
        }
      }
      try {
        const s = await dial(`${dialHost}:${rport}`, 3200);
        return { socket: s, via: tag };
      } catch (e) { /* next candidate */ }
    }
    return null;
  };

  // (1) location exit — the user picked a country: ride its verified relay
  if (key.loc) {
    const c = locById(key.loc);
    if (c && c.relays.length) {
      const r = await relayFor(c.relays, "loc:" + c.id, port);
      if (r) return r;
    }
  }

  // (2) CF-hosted targets: workers cannot connect() to the CF edge — relay
  if (isCfHosted(host)) {
    const pip = await getSetting(env, "proxyip", DEFAULT_PROXYIP);
    const cands = [pip, DEFAULT_PROXYIP].filter((x, i, a) => x && a.indexOf(x) === i);
    const r = await relayFor(cands, "proxyip", port);
    if (r) return r;
  }

  // (3) direct — the worker egress
  return { socket: await dial(`${host}:${port}`), via: "direct" };
}

// quick TCP reachability probe (health card)
export async function checkTcp(host: string, port: number, timeoutMs = 2600): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  try { await dial(`${host}:${port}`, timeoutMs); return { ok: true, ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, ms: Date.now() - t0 }; }
}

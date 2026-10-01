// VOLT worker — VLESS protocol parser + session cookies
// parser ported byte-exact from the live FLASH CORE (parseVless)
import type { VlessReq } from "./types";

const td = new TextDecoder();
const te = new TextEncoder();

function b2h(u8: Uint8Array): string {
  return [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseVless(buf: Uint8Array): VlessReq | null {
  if (buf.length < 19) return null;
  const uuid = b2h(buf.subarray(1, 17)).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  let i = 17;
  i += 1 + buf[i];                       // addons length
  const cmd = buf[i]; i += 1;
  if (cmd === 3) return { uuid, cmd: 3, host: "", port: 0, rest: buf.subarray(i), reply: new Uint8Array([buf[0], 0]) };
  if (cmd !== 1 && cmd !== 2) return { uuid, cmd, host: "", port: 0, rest: new Uint8Array(0), reply: new Uint8Array([buf[0], 0]), bad: true };
  if (buf.length < 24) return null;
  const port = (buf[i] << 8) | buf[i + 1]; i += 2;
  const atyp = buf[i]; i += 1;
  let host = "";
  if (atyp === 1) { host = `${buf[i]}.${buf[i + 1]}.${buf[i + 2]}.${buf[i + 3]}`; i += 4; }
  else if (atyp === 2) { const l = buf[i]; i += 1; host = td.decode(buf.subarray(i, i + l)); i += l; }
  else if (atyp === 3) { host = b2h(buf.subarray(i, i + 16)).replace(/(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})(.{4})/, "$1:$2:$3:$4:$5:$6:$7:$8"); i += 16; }
  else return { uuid, cmd, host: "", port, rest: new Uint8Array(0), reply: new Uint8Array([buf[0], 0]), bad: true };
  return { uuid, cmd, host, port, rest: buf.subarray(i), reply: new Uint8Array([buf[0], 0]) };
}

export function cat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

// 0-RTT early data (sec-websocket-protocol) — standard ed payload
export function earlyData(req: Request): Uint8Array | null {
  const p = req.headers.get("sec-websocket-protocol") || "";
  if (!p) return null;
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  } catch (e) { return null; }
}

// ── session cookie: exp.sig (HMAC-SHA256 over exp with gate as key) ──
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(msg));
  return b2h(new Uint8Array(sig)).slice(0, 32);
}
export async function makeSession(gate: string): Promise<string> {
  const exp = String(Date.now() + 12 * 3600 * 1000);
  return `${exp}.${await hmac(gate, exp)}`;
}
export async function checkSession(gate: string, cookie: string | null): Promise<boolean> {
  if (!cookie) return false;
  const m = /^(\d+)\.([0-9a-f]+)$/.exec(cookie.trim());
  if (!m) return false;
  if (Number(m[1]) < Date.now()) return false;
  return (await hmac(gate, m[1])) === m[2];
}

export const enc = te;
export const dec = td;

// VOLT worker — D1 layer: schema, settings, keys, traffic, bridge
import type { Env, Key, PanelSettings, RadarRow } from "./types";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    uuid TEXT UNIQUE NOT NULL,
    loc TEXT NOT NULL DEFAULT '',
    ip_mode TEXT NOT NULL DEFAULT 'rotate',
    adblock INTEGER NOT NULL DEFAULT 1,
    turbo INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    quota_gb REAL NOT NULL DEFAULT 0,
    used_bytes INTEGER NOT NULL DEFAULT 0,
    expiry_ms INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    last_active INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS radar (
    relay TEXT PRIMARY KEY, loc TEXT NOT NULL, ms INTEGER NOT NULL, ok INTEGER NOT NULL, ts INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS traffic_daily (
    day TEXT NOT NULL, key_id INTEGER NOT NULL, bytes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bridge_inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, cmd TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bridge_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, text TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'msg'
  )`,
];

let schemaReady = false;
export async function ensureSchema(env: Env): Promise<void> {
  if (schemaReady) return;
  try {
    for (const sql of SCHEMA) await env.DB.prepare(sql).run();
    schemaReady = true;
  } catch (e) { /* races between isolates are fine — IF NOT EXISTS */ }
}

// ── settings ──
const SET_CACHE = new Map<string, { v: string; t: number }>();
export async function getSetting(env: Env, k: string, def = ""): Promise<string> {
  const hit = SET_CACHE.get(k);
  if (hit && Date.now() - hit.t < 30000) return hit.v;
  try {
    const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first<{ value: string }>();
    const v = r ? r.value : def;
    SET_CACHE.set(k, { v, t: Date.now() });
    return v;
  } catch (e) { return def; }
}
export async function setSetting(env: Env, k: string, v: string): Promise<void> {
  await ensureSchema(env);
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind(k, String(v)).run();
  SET_CACHE.set(k, { v: String(v), t: Date.now() });
}
export async function getSettings(env: Env): Promise<PanelSettings> {
  return {
    adblock: (await getSetting(env, "adblock", "1")) !== "0" ? 1 : 0,
    ip_mode: (await getSetting(env, "ip_mode", "rotate")) === "fixed" ? "fixed" : "rotate",
    panel_name: await getSetting(env, "panel_name", "فلش"),
    flagless_exit: await getSetting(env, "flagless_exit", "it"),
  };
}

// ── keys ──
const KEY_CACHE = new Map<string, { k: Key | null; t: number }>();   // by uuid
function rowToKey(r: Record<string, unknown>): Key {
  return {
    id: Number(r.id), name: String(r.name), uuid: String(r.uuid), loc: String(r.loc || ""),
    ip_mode: r.ip_mode === "fixed" ? "fixed" : "rotate", adblock: Number(r.adblock ?? 1),
    turbo: Number(r.turbo ?? 0),
    status: r.status === "disabled" ? "disabled" : "active",
    quota_gb: Number(r.quota_gb || 0), used_bytes: Number(r.used_bytes || 0),
    expiry_ms: Number(r.expiry_ms || 0), note: String(r.note || ""),
    created_at: Number(r.created_at || 0), last_active: r.last_active ? Number(r.last_active) : null,
  };
}
export async function getKeyByUuid(env: Env, uuid: string): Promise<Key | null> {
  const low = uuid.toLowerCase();
  const hit = KEY_CACHE.get(low);
  if (hit && Date.now() - hit.t < 30000) return hit.k;
  await ensureSchema(env);
  try {
    const r = await env.DB.prepare("SELECT * FROM keys WHERE lower(uuid)=?").bind(low).first();
    const k = r ? rowToKey(r as Record<string, unknown>) : null;
    KEY_CACHE.set(low, { k, t: Date.now() });
    return k;
  } catch (e) { return null; }
}
export function dropKeyCache(uuid: string): void { KEY_CACHE.delete(uuid.toLowerCase()); }

export async function listKeys(env: Env): Promise<Key[]> {
  await ensureSchema(env);
  const r = await env.DB.prepare("SELECT * FROM keys ORDER BY id DESC LIMIT 500").all();
  return (r.results || []).map((x) => rowToKey(x as Record<string, unknown>));
}

export interface NewKey {
  name: string; uuid?: string; loc?: string; quota_gb?: number;
  expiry_days?: number; ip_mode?: string; adblock?: number; note?: string;
}
export async function createKey(env: Env, nk: NewKey): Promise<Key> {
  await ensureSchema(env);
  const uuid = (nk.uuid && /^[0-9a-f-]{36}$/i.test(nk.uuid)) ? nk.uuid.toLowerCase() : crypto.randomUUID();
  const expDays = Number(nk.expiry_days || 0);
  await env.DB.prepare(
    `INSERT INTO keys (name, uuid, loc, ip_mode, adblock, turbo, quota_gb, expiry_ms, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    String(nk.name || "بدون نام").slice(0, 40), uuid, String(nk.loc || ""), nk.ip_mode === "fixed" ? "fixed" : "rotate",
    nk.adblock === 0 ? 0 : 1, 0, Number(nk.quota_gb || 0),
    expDays > 0 ? Date.now() + expDays * 86400000 : 0, String(nk.note || ""), Date.now()
  ).run();
  KEY_CACHE.delete(uuid);
  const k = await getKeyByUuid(env, uuid);
  if (!k) throw new Error("key create failed");
  return k;
}

export async function deleteKey(env: Env, uuid: string): Promise<boolean> {
  await ensureSchema(env);
  const r = await env.DB.prepare("DELETE FROM keys WHERE lower(uuid)=?").bind(uuid.toLowerCase()).run();
  KEY_CACHE.delete(uuid);
  return (r.meta?.changes || 0) > 0;
}

export interface KeyPatch {
  loc?: string; ip_mode?: string; adblock?: number; turbo?: number; status?: string;
  add_gb?: number; add_days?: number; note?: string; name?: string;
}
export async function patchKey(env: Env, uuid: string, p: KeyPatch): Promise<Key | null> {
  await ensureSchema(env);
  const cur = await getKeyByUuid(env, uuid);
  if (!cur) return null;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (p.loc !== undefined) { sets.push("loc=?"); vals.push(String(p.loc)); }
  if (p.ip_mode !== undefined) { sets.push("ip_mode=?"); vals.push(p.ip_mode === "fixed" ? "fixed" : "rotate"); }
  if (p.adblock !== undefined) { sets.push("adblock=?"); vals.push(p.adblock ? 1 : 0); }
  if (p.turbo !== undefined) { sets.push("turbo=?"); vals.push(p.turbo ? 1 : 0); }
  if (p.status !== undefined) { sets.push("status=?"); vals.push(p.status === "disabled" ? "disabled" : "active"); }
  if (p.note !== undefined) { sets.push("note=?"); vals.push(String(p.note).slice(0, 200)); }
  if (p.name !== undefined) { sets.push("name=?"); vals.push(String(p.name).slice(0, 40)); }
  if (p.add_gb !== undefined && p.add_gb > 0) { sets.push("quota_gb=?"); vals.push(cur.quota_gb + Number(p.add_gb)); }
  if (p.add_days !== undefined && p.add_days > 0) {
    const base = cur.expiry_ms > Date.now() ? cur.expiry_ms : Date.now();
    sets.push("expiry_ms=?"); vals.push(base + Number(p.add_days) * 86400000);
  }
  if (!sets.length) return cur;
  vals.push(cur.id);
  await env.DB.prepare(`UPDATE keys SET ${sets.join(", ")} WHERE id=?`).bind(...vals).run();
  KEY_CACHE.delete(uuid);
  return getKeyByUuid(env, uuid);
}

// ── traffic accounting (batched — D1 writes are expensive) ──
const PENDING = new Map<string, number>();      // uuid -> unflushed bytes
let lastFlush = Date.now();
export function accrue(env: Env, uuid: string, n: number): void {
  PENDING.set(uuid, (PENDING.get(uuid) || 0) + n);
  const total = [...PENDING.values()].reduce((a, b) => a + b, 0);
  if (total > 65536 || Date.now() - lastFlush > 30000) void flushTraffic(env);
}
export async function flushTraffic(env: Env): Promise<void> {
  if (!PENDING.size) return;
  const snap = [...PENDING.entries()];
  PENDING.clear(); lastFlush = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  try {
    for (const [uuid, n] of snap) {
      await env.DB.prepare("UPDATE keys SET used_bytes = used_bytes + ?, last_active = ? WHERE lower(uuid)=?")
        .bind(n, Date.now(), uuid.toLowerCase()).run();
      await env.DB.prepare(
        `INSERT INTO traffic_daily (day, key_id, bytes) VALUES (?,
          (SELECT id FROM keys WHERE lower(uuid)=?), ?)
         ON CONFLICT(day, key_id) DO UPDATE SET bytes = bytes + excluded.bytes`
      ).bind(day, uuid.toLowerCase(), n).run();
    }
  } catch (e) { /* next flush retries */ }
}

export async function trafficToday(env: Env): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const r = await env.DB.prepare("SELECT COALESCE(SUM(bytes),0) AS b FROM traffic_daily WHERE day=?").bind(day).first<{ b: number }>();
    return Number((r && r.b) || 0);
  } catch (e) { return 0; }
}

// ── radar (written by the Go scanner, read by turbo + the panel view) ──
let RADAR_CACHE: { rows: RadarRow[]; t: number } | null = null;
export async function radarRows(env: Env): Promise<RadarRow[]> {
  if (RADAR_CACHE && Date.now() - RADAR_CACHE.t < 60000) return RADAR_CACHE.rows;
  try {
    await ensureSchema(env);
    const r = await env.DB.prepare("SELECT relay, loc, ms, ok, ts FROM radar ORDER BY ms ASC LIMIT 200").all();
    const rows = (r.results || []).map((x) => {
      const o = x as Record<string, unknown>;
      return { relay: String(o.relay), loc: String(o.loc), ms: Number(o.ms), ok: Number(o.ok), ts: Number(o.ts) };
    });
    RADAR_CACHE = { rows, t: Date.now() };
    return rows;
  } catch (e) { return RADAR_CACHE ? RADAR_CACHE.rows : []; }
}
// relay→latency map for turbo ordering (alive relays only)
export async function radarLatencyMap(env: Env): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const r of await radarRows(env)) {
    if (r.ok === 1 && !m.has(r.relay)) m.set(r.relay, r.ms);
  }
  return m;
}

// ── bridge (Go backend bus) ──
export async function inboxPush(env: Env, cmd: string): Promise<number> {
  await ensureSchema(env);
  const r = await env.DB.prepare("INSERT INTO bridge_inbox (ts, cmd) VALUES (?,?)").bind(Date.now(), cmd.slice(0, 500)).run();
  return Number(r.meta?.last_row_id || 0);
}
export async function inboxTake(env: Env, limit = 5): Promise<{ id: number; cmd: string }[]> {
  await ensureSchema(env);
  const r = await env.DB.prepare("SELECT id, cmd FROM bridge_inbox WHERE done=0 ORDER BY id ASC LIMIT ?").bind(limit).all();
  return (r.results || []).map((x) => ({ id: Number((x as Record<string, unknown>).id), cmd: String((x as Record<string, unknown>).cmd) }));
}
export async function inboxMark(env: Env, ids: number[]): Promise<void> {
  if (!ids.length) return;
  for (const id of ids) await env.DB.prepare("UPDATE bridge_inbox SET done=1 WHERE id=?").bind(id).run();
}
export async function outboxPush(env: Env, text: string, kind = "msg"): Promise<number> {
  await ensureSchema(env);
  const r = await env.DB.prepare("INSERT INTO bridge_outbox (ts, text, kind) VALUES (?,?,?)").bind(Date.now(), String(text).slice(0, 4000), kind).run();
  return Number(r.meta?.last_row_id || 0);
}
export async function outboxAfter(env: Env, afterId: number, limit = 50): Promise<{ id: number; ts: number; text: string; kind: string }[]> {
  await ensureSchema(env);
  const r = await env.DB.prepare("SELECT id, ts, text, kind FROM bridge_outbox WHERE id > ? ORDER BY id ASC LIMIT ?").bind(afterId, limit).all();
  return (r.results || []).map((x) => {
    const o = x as Record<string, unknown>;
    return { id: Number(o.id), ts: Number(o.ts), text: String(o.text), kind: String(o.kind) };
  });
}

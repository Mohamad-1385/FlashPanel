// VOLT worker — REST API v1: panel UI + Go backend (botkey auth)
import { Env, Key, Stats } from "./types";
import { VERSION, CORE_ID, LOCATIONS, BUILD } from "./consts";
import {
  ensureSchema, getSettings, setSetting, listKeys, createKey, deleteKey, patchKey,
  getKeyByUuid, trafficToday, inboxPush, outboxAfter, flushTraffic,
} from "./db";
import { checkTcp } from "./dial";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" } });
}
function errJson(msg: string, status = 400): Response { return json({ ok: false, err: msg }, status); }

async function bodyJson(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch (e) { return {}; }
}

export async function handleApi(req: Request, env: Env, path: string, authed: boolean): Promise<Response> {
  const url = new URL(req.url);
  const m = req.method;

  // health — public
  if (path === "/api/v1/health") {
    return json({ ok: true, build: VERSION, core: CORE_ID, name: await (await import("./db")).getSetting(env, "panel_name", "VOLT"), ts: Date.now() });
  }

  // locations — public (read-only catalog)
  if (path === "/api/v1/locations" && m === "GET") {
    return json({
      ok: true,
      locations: LOCATIONS.map((c) => ({ id: c.id, fa: c.fa, en: c.en, flag: c.flag, city: c.city, note: c.note, relays: c.relays.length })),
    });
  }

  // stats — session or botkey
  if (path === "/api/v1/stats") {
    if (!authed) return errJson("unauthorized", 401);
    const keys = await listKeys(env);
    const stats: Stats = {
      keys: keys.length,
      active: keys.filter((k) => k.status === "active" && (!k.expiry_ms || k.expiry_ms > Date.now())).length,
      online: keys.filter((k) => k.last_active && Date.now() - k.last_active < 300000).length,
      trafficToday: await trafficToday(env),
      lifetimeBytes: keys.reduce((a, k) => a + k.used_bytes, 0),
      locations: LOCATIONS.length,
      build: VERSION, ts: Date.now(),
    };
    return json({ ok: true, stats, settings: await getSettings(env) });
  }

  // ── botkey-authenticated management APIs (Go backend / admin) ──
  if (!authed) return errJson("unauthorized", 401);
  await ensureSchema(env);

  if (path === "/api/v1/keys" && m === "GET") {
    const keys = await listKeys(env);
    return json({ ok: true, keys });
  }
  if (path === "/api/v1/keys" && m === "POST") {
    const b = await bodyJson(req);
    if (!b.name) return errJson("name required");
    try {
      const k = await createKey(env, {
        name: String(b.name), uuid: b.uuid ? String(b.uuid) : undefined, loc: b.loc ? String(b.loc) : "",
        quota_gb: b.quota_gb !== undefined ? Number(b.quota_gb) : 0,
        expiry_days: b.expiry_days !== undefined ? Number(b.expiry_days) : 0,
        ip_mode: b.ip_mode ? String(b.ip_mode) : "rotate", adblock: b.adblock !== undefined ? Number(b.adblock) : 1,
        note: b.note ? String(b.note) : "",
      });
      return json({ ok: true, key: k });
    } catch (e) { return errJson(String((e as Error).message || e).slice(0, 120)); }
  }
  const km = /^\/api\/v1\/keys\/([0-9a-f-]{36})$/.exec(path);
  if (km) {
    const uuid = km[1];
    if (m === "GET") {
      const k = await getKeyByUuid(env, uuid);
      return k ? json({ ok: true, key: k }) : errJson("not found", 404);
    }
    if (m === "DELETE") {
      const ok = await deleteKey(env, uuid);
      return ok ? json({ ok: true }) : errJson("not found", 404);
    }
    if (m === "POST" || m === "PATCH") {
      const b = await bodyJson(req);
      const k = await patchKey(env, uuid, {
        loc: b.loc !== undefined ? String(b.loc) : undefined,
        ip_mode: b.ip_mode !== undefined ? String(b.ip_mode) : undefined,
        adblock: b.adblock !== undefined ? Number(b.adblock) : undefined,
        status: b.status !== undefined ? String(b.status) : undefined,
        add_gb: b.add_gb !== undefined ? Number(b.add_gb) : undefined,
        add_days: b.add_days !== undefined ? Number(b.add_days) : undefined,
        note: b.note !== undefined ? String(b.note) : undefined,
        name: b.name !== undefined ? String(b.name) : undefined,
      });
      return k ? json({ ok: true, key: k }) : errJson("not found", 404);
    }
  }

  if (path === "/api/v1/settings" && m === "GET") return json({ ok: true, settings: await getSettings(env) });
  if (path === "/api/v1/settings" && m === "POST") {
    const b = await bodyJson(req);
    if (b.adblock !== undefined) await setSetting(env, "adblock", String(Number(b.adblock) ? 1 : 0));
    if (b.ip_mode !== undefined) await setSetting(env, "ip_mode", String(b.ip_mode) === "fixed" ? "fixed" : "rotate");
    if (b.panel_name !== undefined) await setSetting(env, "panel_name", String(b.panel_name).slice(0, 24));
    if (b.flagless_exit !== undefined) await setSetting(env, "flagless_exit", String(b.flagless_exit).slice(0, 4));
    if (b.proxyip !== undefined) await setSetting(env, "proxyip", String(b.proxyip).slice(0, 100));
    return json({ ok: true, settings: await getSettings(env) });
  }

  // relay latency probe (locations page live ping)
  if (path === "/api/v1/probe" && m === "GET") {
    const loc = url.searchParams.get("loc") || "";
    const c = LOCATIONS.find((x) => x.id === loc);
    if (!c) return errJson("unknown loc", 404);
    const r = await checkTcp(c.relays[0], 443, 3000);
    return json({ ok: true, loc, live: r });
  }

  // bridge: panel terminal → inbox (Go polls D1 directly); outbox for UI
  if (path === "/api/v1/bridge" && m === "POST") {
    const b = await bodyJson(req);
    const cmd = String(b.cmd || "").trim();
    if (!cmd) return errJson("cmd required");
    const id = await inboxPush(env, cmd);
    return json({ ok: true, id });
  }
  if (path === "/api/v1/bridge" && m === "GET") {
    const after = Number(url.searchParams.get("after") || 0);
    return json({ ok: true, outbox: await outboxAfter(env, after) });
  }

  if (path === "/api/v1/flush" && m === "POST") { await flushTraffic(env); return json({ ok: true }); }

  return errJson("no such endpoint", 404);
}

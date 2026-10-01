// VOLT worker — main router: decoy / gate / app pages / api / sub / tunnel
import { Env } from "./types";
import { VERSION, CORE_ID } from "./consts";
import { checkSession, makeSession } from "./vless";
import { handleApi } from "./api";
import { serveSub } from "./sub";
import { handleTunnel } from "./tunnel";
import { decoyPage, loginPage, dashboardHTML, locationsHTML, keysHTML, settingsHTML, terminalHTML } from "./ui";
import { getSettings, listKeys, flushTraffic } from "./db";
import type { Stats } from "./types";

const NO_STORE = { "cache-control": "no-store" };

function html(s: string, status = 200): Response {
  return new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
}

async function authed(req: Request, env: Env): Promise<boolean> {
  // session cookie OR botkey header/query
  const cookie = (req.headers.get("cookie") || "").match(/volt_sess=([^\s;]+)/)?.[1] || null;
  if (cookie && (await checkSession(env.GATE, cookie))) return true;
  const bk = req.headers.get("x-volt-key") || new URL(req.url).searchParams.get("key");
  return !!bk && bk === env.BOTKEY;
}

async function loadStats(env: Env): Promise<Stats> {
  const keys = await listKeys(env);
  const s = await getSettings(env);
  const { trafficToday } = await import("./db");
  return {
    keys: keys.length,
    active: keys.filter((k) => k.status === "active" && (!k.expiry_ms || k.expiry_ms > Date.now())).length,
    online: keys.filter((k) => k.last_active && Date.now() - k.last_active < 300000).length,
    trafficToday: await trafficToday(env),
    lifetimeBytes: keys.reduce((a, k) => a + k.used_bytes, 0),
    locations: 33, build: VERSION, ts: Date.now(),
  };
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;

    try {
      // WebSocket tunnels: /<TPATH>/<uuid>/
      if (p.startsWith("/" + env.TPATH + "/")) return await handleTunnel(req, env, ctx);

      // decoy cover
      if (p === "/" || p === "/favicon.ico") {
        if (p === "/") return new Response(decoyPage(), { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
        return new Response(null, { status: 404 });
      }

      // gate: entry + auth
      if (p === "/g/" + env.GATE) return html(loginPage(env.GATE));
      if (p === "/g/" + env.GATE + "/auth" && req.method === "POST") {
        const sess = await makeSession(env.GATE);
        return new Response(null, { status: 302, headers: { location: "/app", "set-cookie": `volt_sess=${sess}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax`, ...NO_STORE } });
      }

      // panel pages (session)
      if (p === "/app" || p.startsWith("/app/")) {
        if (!(await authed(req, env))) return new Response(null, { status: 302, headers: { location: "/g/" + env.GATE } });
        const sec = p.slice(4);   // "/app/locations" → "/locations"
        const settings = await getSettings(env);
        if (sec === "" || sec === "/") return html(dashboardHTML(env, await loadStats(env), settings));
        if (sec === "/locations") return html(locationsHTML(env));
        if (sec === "/keys") return html(keysHTML(env, await listKeys(env), url.hostname));
        if (sec === "/settings") return html(settingsHTML(env, settings));
        if (sec === "/terminal") return html(terminalHTML(env));
        return html("not found", 404);
      }

      // subscriptions: /sub/<uuid>
      if (p.startsWith("/sub/")) return await serveSub(req, env, p.slice(5).replace(/\/+$/, ""));

      // API
      if (p.startsWith("/api/v1/")) return await handleApi(req, env, p, await authed(req, env));

      return new Response("Not found", { status: 404, headers: NO_STORE });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, err: String((e as Error).message || e).slice(0, 200), core: CORE_ID }), { status: 500, headers: { "content-type": "application/json" } });
    }
  },
};

// FLASHLAB worker — main router: decoy / gate (password login) / app pages /
// api / sub / QR / tunnel
import { Env } from "./types";
import { VERSION, CORE_ID } from "./consts";
import { checkSession, makeSession } from "./vless";
import { handleApi } from "./api";
import { serveSub } from "./sub";
import { handleTunnel } from "./tunnel";
import { qrSvg } from "./qr";
import { decoyPage, loginPage, dashboardHTML, locationsHTML, keysHTML, radarHTML, settingsHTML, terminalHTML } from "./ui";
import { getSettings, getSetting, listKeys, flushTraffic } from "./db";
import type { Stats } from "./types";

const NO_STORE = { "cache-control": "no-store" };

function html(s: string, status = 200): Response {
  return new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
}

async function authed(req: Request, env: Env): Promise<boolean> {
  // session cookie OR botkey header/query
  const cookie = (req.headers.get("cookie") || "").match(/fl_sess=([^\s;]+)/)?.[1] || null;
  if (cookie && (await checkSession(env.GATE, cookie))) return true;
  const bk = req.headers.get("x-fl-key") || new URL(req.url).searchParams.get("key");
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
    locations: 24, build: VERSION, ts: Date.now(),
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

      // gate: entry + auth (password = the panel/admin code, seeded by Go deploy)
      if (p === "/g/" + env.GATE) return html(loginPage(env.GATE));
      if (p === "/g/" + env.GATE + "/auth" && req.method === "POST") {
        const form = await req.formData().catch(() => null);
        const pass = String(form?.get("password") || "");
        const want = await getSetting(env, "panel_pass", "");
        if (!want || pass !== want) {
          return new Response(loginPage(env.GATE, "❌ رمز اشتباه است"), { status: 401, headers: { "content-type": "text/html; charset=utf-8", ...NO_STORE } });
        }
        const sess = await makeSession(env.GATE);
        return new Response(null, { status: 302, headers: { location: "/app", "set-cookie": `fl_sess=${sess}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax`, ...NO_STORE } });
      }

      // panel pages (session)
      if (p === "/app" || p.startsWith("/app/")) {
        if (!(await authed(req, env))) return new Response(null, { status: 302, headers: { location: "/g/" + env.GATE } });
        const sec = p.slice(4);   // "/app/locations" → "/locations"
        const settings = await getSettings(env);
        if (sec === "" || sec === "/") return html(dashboardHTML(env, await loadStats(env), settings));
        if (sec === "/locations") return html(locationsHTML(env));
        if (sec === "/keys") return html(keysHTML(env, await listKeys(env), url.hostname));
        if (sec === "/radar") return html(radarHTML(env));
        if (sec === "/settings") return html(settingsHTML(env, settings));
        if (sec === "/terminal") return html(terminalHTML(env));
        return html("not found", 404);
      }

      // QR: /qr/<uuid>[?frag=mci] — scan-to-import (session or botkey)
      if (p.startsWith("/qr/")) {
        if (!(await authed(req, env))) return new Response(null, { status: 302, headers: { location: "/g/" + env.GATE } });
        const uuid = p.slice(4).replace(/\.svg$/, "").replace(/\/+$/, "");
        const key = (await listKeys(env)).find((k) => k.uuid.toLowerCase() === uuid.toLowerCase());
        if (!key) return new Response("not found", { status: 404 });
        const frag = url.searchParams.get("frag") || "mci";
        const port = url.searchParams.get("port") || "443";
        const link = `vless://${key.uuid}@${url.hostname}:${port}?encryption=none&security=tls&sni=${url.hostname}&fp=chrome&alpn=http%2F1.1&type=ws&host=${url.hostname}&path=${encodeURIComponent("/" + env.TPATH + "/" + key.uuid + "/?ed=2560")}&fragment=${frag === "none" ? "" : "100-200-1-1"}#${encodeURIComponent("فلش " + key.name)}`;
        return new Response(qrSvg(link, { title: "فلش " + key.name }), {
          status: 200,
          headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" },
        });
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

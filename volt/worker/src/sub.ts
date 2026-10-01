// VOLT worker — subscription engine: vless links + base64 + full Xray JSON +
// sing-box (7.9.29-correct: no domain_strategy) + clash
import { Env, Key } from "./types";
import { TLS_PORTS, PLAIN_PORTS, FRAG_PROFILES, locById, LOCATIONS, AD_BLOCK_SUFFIXES } from "./consts";
import { getKeyByUuid } from "./db";

function b64(s: string): string { return btoa(s); }
function links(key: Key, host: string, tpath: string, opts: { frag?: string; ipm?: string }): string[] {
  const out: string[] = [];
  const fragProf = opts.frag && FRAG_PROFILES[opts.frag] ? FRAG_PROFILES[opts.frag].l : "";
  const ipmBadge = opts.ipm === "fixed" ? " 📌" : "";
  const locName = key.loc ? `${locById(key.loc)?.flag || ""} ${locById(key.loc)?.fa || key.loc}` : "بدون لوکیشن";
  for (const port of TLS_PORTS) {
    const name = `VOLT ${locName} · ${port}${ipmBadge}`;
    const q = `encryption=none&security=tls&sni=${host}&fp=chrome&alpn=http%2F1.1&type=ws&host=${host}&path=${encodeURIComponent(`/${tpath}/${key.uuid}/?ed=2560`)}${fragProf ? `&fragment=${fragProf}-1-1` : ""}`;
    out.push(`vless://${key.uuid}@${host}:${port}?${q}#${encodeURIComponent(name)}`);
  }
  for (const port of PLAIN_PORTS) {
    const name = `VOLT ${locName} · ${port} (بدون TLS)${ipmBadge}`;
    const q = `encryption=none&security=none&type=ws&host=${host}&path=${encodeURIComponent(`/${tpath}/${key.uuid}/`)}`;
    out.push(`vless://${key.uuid}@${host}:${port}?${q}#${encodeURIComponent(name)}`);
  }
  return out;
}

function xjsonConfig(key: Key, host: string, tpath: string, frag: string): string {
  const loc = key.loc ? locById(key.loc) : null;
  const tag = `volt-${key.loc || "direct"}`;
  const fragL = FRAG_PROFILES[frag]?.l;
  return JSON.stringify({
    log: { loglevel: "warning" },
    dns: { servers: ["1.1.1.1", "8.8.8.8"], queryStrategy: "UseIPv4" },
    inbounds: [
      { tag: "socks", port: 10808, listen: "127.0.0.1", protocol: "socks", settings: { udp: true }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"] } },
      { tag: "http", port: 10809, listen: "127.0.0.1", protocol: "http", settings: {} },
    ],
    outbounds: [
      { tag: "fragment", protocol: "freedom", settings: fragL ? { domainStrategy: "AsIs", fragment: { packets: "tlshello", length: fragL, interval: "1-1" } } : { domainStrategy: "AsIs" }, streamSettings: { sockopt: { dialerProxy: "proxy" } } },
      { tag: "proxy", protocol: "vless", settings: { vnext: [{ address: host, port: 443, users: [{ id: key.uuid, encryption: "none", flow: "" }] }] }, streamSettings: { network: "ws", security: "tls", tlsSettings: { serverName: host, fingerprint: "chrome", alpn: ["http/1.1"] }, wsSettings: { path: `/${tpath}/${key.uuid}/?ed=2560`, headers: { Host: host } } }, mux: { enabled: false, concurrency: -1 } },
      { tag: "direct", protocol: "freedom", settings: { domainStrategy: "AsIs" } },
      { tag: "block", protocol: "blackhole", settings: {} },
    ],
    routing: {
      domainStrategy: "AsIs",
      rules: [
        ...(key.adblock ? [{ type: "field", outboundTag: "block", domain: ["geosite:category-ads-all", ...AD_BLOCK_SUFFIXES.map((s) => "domain:" + s)] }] : []),
        { type: "field", outboundTag: "fragment", network: "tcp" },
        { type: "field", outboundTag: "direct", ip: ["geoip:private"] },
      ],
    },
    policy: { levels: { "0": { handshake: 2, connIdle: 180, uplinkOnly: 0, downlinkOnly: 0 } }, system: { statsOutletUplink: false, statsOutletDownlink: false } },
    remarks: `VOLT${loc ? " " + loc.fa : ""} — GoCore`,
  }, null, 1);
}

function singboxConfig(key: Key, host: string, tpath: string): string {
  const outbounds: unknown[] = [];
  const tags: string[] = [];
  for (const port of [443, 8443]) {
    const t = `volt-${port}`;
    tags.push(t);
    outbounds.push({
      tag: t, type: "vless", server: host, server_port: port, uuid: key.uuid, flow: "",
      tls: { enabled: true, server_name: host, utls: { enabled: true, fingerprint: "chrome" } },
      // NOTE (7.9.29 «جهان‌گیر» lesson): NO domain_strategy on proxy outbounds —
      // with FakeDNS it turned domains into fake 198.18.x IPs (dead ping-119 bug)
      transport: { type: "ws", path: `/${tpath}/${key.uuid}/?ed=2560`, early_data_header_name: "Sec-WebSocket-Protocol", max_early_data: 2560 },
    });
  }
  outbounds.unshift({ tag: "urltest", type: "urltest", outbounds: tags, url: "https://cp.cloudflare.com/generate_204", interval: "5m", interrupt_exist_connections: false });
  outbounds.push({ tag: "direct", type: "direct" });
  outbounds.push({ tag: "block", type: "block" });
  const rules: unknown[] = [];
  if (key.adblock) rules.push({ rule_set: [], domain_suffix: AD_BLOCK_SUFFIXES.slice(0, 30), outbound: "block" });
  rules.push({ ip_is_private: true, outbound: "direct" });
  return JSON.stringify({
    log: { level: "warn" },
    dns: { servers: [{ tag: "cf", address: "https://1.1.1.1/dns-query", detour: "direct" }], strategy: "ipv4_only" },
    outbounds,
    route: { rules, final: tags[0], auto_detect_interface: true },
  }, null, 1);
}

function clashConfig(key: Key, host: string, tpath: string): string {
  const proxies: string[] = [];
  const names: string[] = [];
  for (const port of [443, 8443]) {
    const n = `VOLT-${port}`;
    names.push(n);
    proxies.push(
`  - name: "${n}"
    type: vless
    server: ${host}
    port: ${port}
    uuid: ${key.uuid}
    tls: true
    servername: ${host}
    client-fingerprint: chrome
    network: ws
    skip-cert-verify: false
    ws-opts:
      path: /${tpath}/${key.uuid}/?ed=2560
      headers:
        Host: ${host}`
    );
  }
  const rejects = key.adblock ? AD_BLOCK_SUFFIXES.slice(0, 30).map((s) => `  - DOMAIN-SUFFIX,${s},REJECT`).join("\n") + "\n" : "";
  return `proxies:
${proxies.join("\n")}
proxy-groups:
  - name: VOLT
    type: url-test
    url: https://cp.cloudflare.com/generate_204
    interval: 300
    proxies:
${names.map((n) => `      - "${n}"`).join("\n")}
rules:
${rejects}  - MATCH,VOLT
`;
}

export async function serveSub(req: Request, env: Env, uuid: string): Promise<Response> {
  const key = await getKeyByUuid(env, uuid);
  if (!key) return new Response("not found", { status: 404 });
  if (key.status !== "active") return new Response("key disabled", { status: 403 });
  const url = new URL(req.url);
  const host = url.hostname;
  const format = (url.searchParams.get("format") || "base64").toLowerCase();
  const frag = url.searchParams.get("frag") || "";
  const ipm = url.searchParams.get("ipm") || (key.ip_mode === "fixed" ? "fixed" : "");
  const tpath = env.TPATH;

  const hdr = (ct: string, cache = "public, max-age=240") => new Response(null as unknown as BodyInit, { status: 200, headers: { "content-type": ct, "cache-control": cache } });

  let body = "";
  let ct = "text/plain; charset=utf-8";
  if (format === "links") body = links(key, host, tpath, { frag, ipm }).join("\n");
  else if (format === "xjson") { ct = "application/json; charset=utf-8"; body = xjsonConfig(key, host, tpath, frag); }
  else if (format === "singbox" || format === "sing-box") { ct = "application/json; charset=utf-8"; body = singboxConfig(key, host, tpath); }
  else if (format === "clash") { ct = "text/yaml; charset=utf-8"; body = clashConfig(key, host, tpath); }
  else { body = b64(links(key, host, tpath, { frag, ipm }).join("\n")); }
  void hdr;
  return new Response(body, { status: 200, headers: { "content-type": ct, "cache-control": "public, max-age=240", "profile-update-interval": "24", "subscription-userinfo": `upload=0; download=${key.used_bytes}; total=${key.quota_gb > 0 ? key.quota_gb * 1024 ** 3 : 0}; expire=${key.expiry_ms ? Math.floor(key.expiry_ms / 1000) : 0}` } });
}

export { links as buildLinks };

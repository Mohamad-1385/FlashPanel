// VOLT worker — WebSocket tunnel: VLESS TCP + UDP-DNS bridge + accounting
// 0-RTT early data, 25s keepalive heartbeat (the Telegram «درحال اتصال» fix)
// DOWNLINK: remote.readable.pipeTo(...) + ctx.waitUntil — the edge-proven
// pattern (manual reader loops get cancelled when the WS message event ends).
import { Env, Key, VlessReq } from "./types";
import { accrue, flushTraffic, getKeyByUuid } from "./db";
import { parseVless, cat, earlyData, enc } from "./vless";
import { connectTarget } from "./dial";
import { DNS_HOST } from "./consts";
import { connect } from "cloudflare:sockets";

type Ws = {
  accept(): void;
  send(data: ArrayBuffer | Uint8Array | string): void;
  close(code?: number, reason?: string): void;
  addEventListener(ev: "message", fn: (e: { data: unknown }) => void): void;
  addEventListener(ev: "close", fn: () => void): void;
};

interface TunnelCtx { key: Key; env: Env; ws: Ws; uid: string }

function kill(ws: Ws, code = 1008): void { try { ws.close(code, "denied"); } catch (e) { /* already closed */ } }

export async function handleTunnel(req: Request, env: Env, ectx: ExecutionContext): Promise<Response> {
  const upgrade = req.headers.get("upgrade");
  if (!upgrade || upgrade.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 400 });
  const pair = new WebSocketPair();
  const ws = pair[1] as unknown as Ws;
  ws.accept();

  const ctx: TunnelCtx = { key: null as unknown as Key, env, ws, uid: "" };
  let parsed: VlessReq | null = null;
  let headerBuf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  type Remote = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array>; close(): void };
  let remote: Remote | null = null;
  let remoteWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  let alive = true;
  const pendingQ: Uint8Array[] = [];

  const waitUntil = (p: Promise<unknown>) => { try { ectx.waitUntil(p); } catch (e) { /* best effort */ } };

  // 25s server-side heartbeat — idle WS gets killed by the CF edge otherwise
  // (root cause of the Telegram «connecting…» cycle, fixed live in 7.9.27)
  const hb = setInterval(() => { try { ws.send(new Uint8Array([0x89, 0x00])); } catch (e) {} }, 25000);
  waitUntil(new Promise((r) => setTimeout(r, 0)));   // ensure ctx stays warm for the interval

  const teardown = () => {
    if (!alive) return;
    alive = false;
    clearInterval(hb);
    if (ctx.uid) waitUntil(flushTraffic(env));
    try { remote?.close(); } catch (e) {}
    try { ws.close(1000); } catch (e) {}
  };

  // ── downlink pump (edge-proven pipeTo pattern) ──
  const startPump = () => {
    if (!remote) return;
    const pump = remote.readable.pipeTo(new WritableStream<Uint8Array>({
      async write(value) {
        if (!alive) return;
        try { ws.send(value as unknown as ArrayBuffer); accrue(env, ctx.uid, value.length); }
        catch (e) { teardown(); }
      },
      close() { teardown(); },
      abort() { teardown(); },
    })).catch(() => {});
    waitUntil(pump);
  };

  // UDP-DNS bridge: VLESS cmd=2 port 53.
  // Chain (live-proven): ① DoH RFC-8484 (raw DNS bytes over fetch — works
  // from workers) ② TCP 8.8.4.4:53 with length prefix ③ drop.
  const dnsAnswer = async (q: Uint8Array): Promise<Uint8Array | null> => {
    // ① DoH — dns.google accepts application/dns-message POSTs
    try {
      const r = await fetch("https://dns.google/dns-query", {
        method: "POST", headers: { "content-type": "application/dns-message" },
        body: q as unknown as BodyInit, signal: AbortSignal.timeout(2500),
      });
      if (r.ok) {
        const ans = new Uint8Array(await r.arrayBuffer());
        if (ans.length >= 12) return ans;
      }
    } catch (e) { /* next */ }
    // ② TCP resolver
    try {
      const s = (await connect(`${DNS_HOST}:53`, { secureTransport: "off", allowHalfOpen: false } as never)) as unknown as Remote;
      const w = s.writable.getWriter();
      const frame = new Uint8Array(2 + q.length);
      frame[0] = (q.length >> 8) & 255; frame[1] = q.length & 255;
      frame.set(q, 2);
      await w.write(frame);
      try { w.releaseLock(); } catch (e) {}
      const rd = s.readable.getReader();
      let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      for (;;) {
        const res = await Promise.race([
          rd.read(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("dns-timeout")), 4000)),
        ]);
        if (res.done) break;
        buf = cat(buf, res.value);
        if (buf.length >= 2) {
          const need = 2 + ((buf[0] << 8) | buf[1]);
          if (need > 2 && buf.length >= need) {
            const ans = buf.subarray(2, need);
            try { rd.cancel(); } catch (e) {}
            try { s.close(); } catch (e) {}
            return ans;
          }
        }
      }
      try { s.close(); } catch (e) {}
    } catch (e) { /* drop */ }
    return null;
  };
  const dnsFrames = async (buf: Uint8Array) => {
    let i = 0;
    while (i + 2 <= buf.length) {
      const len = (buf[i] << 8) | buf[i + 1];
      if (i + 2 + len > buf.length) break;
      const q = buf.subarray(i + 2, i + 2 + len);
      i += 2 + len;
      const ans = await dnsAnswer(q);
      if (ans && ans.length) {
        const f = new Uint8Array(2 + ans.length);
        f[0] = (ans.length >> 8) & 255; f[1] = ans.length & 255;
        f.set(ans, 2);
        ws.send(f as unknown as ArrayBuffer);
      }
    }
  };

  const onData = async (dataIn: unknown) => {
    try {
      let data: Uint8Array<ArrayBufferLike>;
      if (dataIn instanceof ArrayBuffer) data = new Uint8Array(dataIn);
      else if (typeof dataIn === "string") data = enc.encode(dataIn);
      else data = dataIn as Uint8Array<ArrayBufferLike>;
      if (!data || !data.length) return;

      if (!parsed) {
        headerBuf = cat(headerBuf, data);
        if (headerBuf.length < 19) return;
        if (headerBuf[0] !== 0) return kill(ws);            // VLESS only (MVP)
        const v = parseVless(headerBuf);
        if (!v) return;
        if (v.bad) return kill(ws);

        // auth + gate
        const key = await getKeyByUuid(env, v.uuid);
        if (!key) return kill(ws);
        if (key.status !== "active") return kill(ws);
        if (key.expiry_ms && key.expiry_ms < Date.now()) return kill(ws);
        if (key.quota_gb > 0 && key.used_bytes >= key.quota_gb * 1024 ** 3) return kill(ws);
        ctx.key = key; ctx.uid = key.uuid;

        // UDP: only DNS rides the bridge; other UDP refused → browsers drop QUIC
        if (v.cmd === 2) {
          ws.send(v.reply as unknown as ArrayBuffer);
          if (v.port === 53 && v.rest.length) await dnsFrames(v.rest);
          else { try { ws.close(1000); } catch (e) {} }
          return;
        }
        parsed = v;
        // response leaves IMMEDIATELY — the client handshake proceeds in
        // parallel with the upstream dial (non-0-RTT clients don't pay dial first)
        ws.send(v.reply as unknown as ArrayBuffer);
        if (v.rest && v.rest.length) pendingQ.push(v.rest);

        // dial upstream
        try {
          const dialed = await connectTarget(env, key, v.host, v.port);
          remote = dialed.socket;
          remoteWriter = remote.writable.getWriter();
        } catch (e) { return teardown(); }
        // downlink pump FIRST (pipeTo + waitUntil — survives the handler)
        startPump();
        // then the first payload upstream
        for (const c of pendingQ) {
          accrue(env, ctx.uid, c.length);
          try { await remoteWriter.write(c); } catch (e) { return teardown(); }
        }
        pendingQ.length = 0;
        return;
      }

      // steady state: upload bytes
      if (remoteWriter) {
        accrue(env, ctx.uid, data.length);
        try { await remoteWriter.write(data); } catch (e) { teardown(); }
      } else pendingQ.push(data);
    } catch (e) { teardown(); }
  };

  ws.addEventListener("message", (e) => { void onData(e.data); });
  ws.addEventListener("close", () => { alive = false; clearInterval(hb); if (ctx.uid) waitUntil(flushTraffic(env)); try { remote?.close(); } catch (e) {} });

  // 0-RTT: early data is the first protocol payload
  const ed = earlyData(req);
  if (ed && ed.length) waitUntil(onData(ed));

  return new Response(null, { status: 101, webSocket: pair[0] as unknown as WebSocket });
}

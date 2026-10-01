// VOLT worker — shared types (TypeScript data plane)
// P180 «جرقه» — 75% Go backend+bot / 20% TS worker / 5% Tailwind UI

export interface Env {
  DB: D1Database;
  GATE: string;        // gate secret — panel entry path
  BOTKEY: string;      // bot API key (Go backend / admin APIs)
  TPATH: string;       // tunnel path prefix
  AI?: unknown;        // reserved (Workers AI — not used by MVP)
}

export interface Key {
  id: number;
  name: string;
  uuid: string;
  loc: string;            // '' = بدون لوکیشن | country id
  ip_mode: "rotate" | "fixed";
  adblock: number;
  status: "active" | "disabled";
  quota_gb: number;       // 0 = بی‌نهایت
  used_bytes: number;
  expiry_ms: number;      // 0 = بی‌نهایت
  note: string;
  created_at: number;
  last_active: number | null;
}

export interface LocCountry {
  id: string; fa: string; en: string; flag: string; cont: string; city: string;
  relays: string[]; note: string;
}

export interface PanelSettings {
  adblock: number;            // default ON
  ip_mode: "rotate" | "fixed";
  panel_name: string;
  flagless_exit: string;
}

export interface VlessReq {
  uuid: string;
  cmd: number;              // 1=TCP 2=UDP 3=MUX
  host: string;
  port: number;
  rest: Uint8Array;
  reply: Uint8Array;
  bad?: boolean;
}

export interface Stats {
  keys: number; active: number; online: number; trafficToday: number;
  lifetimeBytes: number; locations: number; build: string; ts: number;
}

export interface BridgeMsg {
  id: number; ts: number; cmd: string; done: number;
}
export interface OutboxMsg {
  id: number; ts: number; text: string; kind: string;
}

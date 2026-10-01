// FLASHLAB worker — server-side QR codes as crisp SVG (scan-to-import in one
// shot from the panel). Engine: the battle-tested qrcode-generator core
// (Kazuhiko Arase, MIT — the same engine the FLASH panel ships since v2),
// vendored minified in qr-lib.js; this wrapper is fully typed.
import { qrAuto } from "./qr-lib.js";

export interface QrSvgOptions {
  dark?: string;      // module color
  light?: string;     // background
  scale?: number;     // px per module
  quiet?: number;     // quiet-zone modules
  title?: string;     // <title> for a11y
}

/** Renders one QR as an SVG string. Throws on payloads beyond type-40. */
export function qrSvg(text: string, o: QrSvgOptions = {}): string {
  const dark = o.dark ?? "#0b1226";
  const light = o.light ?? "#ffffff";
  const scale = o.scale ?? 6;
  const quiet = o.quiet ?? 2;
  const q = qrAuto(text, "M");
  const n = q.getModuleCount();
  const size = (n + quiet * 2) * scale;
  const parts: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (q.isDark(y, x)) {
        parts.push(`M${(x + quiet) * scale} ${(y + quiet) * scale}h${scale}v${scale}h-${scale}z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img"${o.title ? ` aria-label="${esc(o.title)}"` : ""}>${o.title ? `<title>${esc(o.title)}</title>` : ""}<rect width="${size}" height="${size}" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// VOLT build — step 1: compile Tailwind v4 → ui/dist/volt.css
// uses the @tailwindcss/node compile() API (CLI package not installed):
// compile() returns candidate-driven build() — we scan the TS sources for
// class tokens ourselves and feed them in.
"use strict";
const { compile } = require("@tailwindcss/node");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC_FILE = path.join(ROOT, "worker/src/ui.ts");

(async () => {
  const css = fs.readFileSync(path.join(ROOT, "ui/src/input.css"), "utf8");
  const compiler = await compile(css, {
    base: ROOT,
    onDependency: () => {},   // no @import deps beyond tailwindcss itself
  });

  // candidate extraction: every whitespace/quote-separated token from the UI source
  const raw = fs.readFileSync(SRC_FILE, "utf8");
  const seen = new Set();
  for (const tok of raw.split(/[\s`"'>=/()]+/)) {
    if (tok && tok.length < 100 && !seen.has(tok)) seen.add(tok);
  }
  const candidates = [...seen];
  const out = compiler.build(candidates);
  const outPath = path.join(ROOT, "ui/dist/volt.css");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
  console.log(`[tailwind] ${candidates.length} candidates → ui/dist/volt.css (${out.length} bytes)`);
})().catch((e) => { console.error("tailwind build failed:", e && e.message || e); process.exit(1); });

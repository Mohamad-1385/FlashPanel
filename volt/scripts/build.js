// VOLT build — step 2: esbundle TypeScript worker → inject compiled CSS → dist/worker.js
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const ESBUILD = path.join(ROOT, "..", "node_modules", ".bin", "esbuild");
const TSC = path.join(ROOT, "..", "node_modules", ".bin", "tsc");

function run(cmd) { execSync(cmd, { cwd: ROOT, stdio: "inherit" }); }

(async () => {
  // typecheck (real TypeScript — zero `any` shortcuts)
  console.log("[tsc] typechecking…");
  run(`${TSC} -p worker/tsconfig.json --noEmit`);

  // compile tailwind
  run(`node ${path.join(__dirname, "tailwind.js")}`);
  const css = fs.readFileSync(path.join(ROOT, "ui/dist/volt.css"), "utf8");

  // bundle TS → worker.js (ESM)
  console.log("[esbuild] bundling…");
  run(`${ESBUILD} worker/src/main.ts --bundle --format=esm --platform=neutral --target=es2022 --outfile=worker/dist/worker.js --minify --external:cloudflare:sockets --legal-comments=none`);

  // inject CSS into the __VOLT_CSS__ placeholder (full string-literal escaping)
  const jsPath = path.join(ROOT, "worker/dist/worker.js");
  let js = fs.readFileSync(jsPath, "utf8");
  if (!js.includes("__VOLT_CSS__")) throw new Error("CSS placeholder not found in bundle");
  const cssEsc = css
    .replace(/\\/g, "\\\\")     // backslashes
    .replace(/"/g, '\\"')       // double quotes
    .replace(/\r/g, "")         // CR
    .replace(/\n/g, "\\n")      // newlines → \n
    .replace(/\t/g, "\\t");
  js = js.replace("__VOLT_CSS__", cssEsc);
  fs.writeFileSync(jsPath, js);

  const size = fs.statSync(jsPath).size;
  console.log(`[build] worker/dist/worker.js — ${(size / 1024).toFixed(1)} KB (CSS inlined: ${(css.length / 1024).toFixed(1)} KB)`);
})().catch((e) => { console.error("BUILD FAILED:", e.message); process.exit(1); });

/**
 * Renders a placeholder photo for each gown and emits SQL to load them.
 *
 * These are stand-ins so the storefront doesn't look broken before real photos
 * exist: a silhouette in the gown's own colourway, with its tag number. Each is
 * marked in the filename as a placeholder so they're easy to find and replace.
 *
 *   node scripts/make-placeholders.mjs > placeholders.sql
 *   npx wrangler d1 execute rental-ledger --remote --file=placeholders.sql
 *
 * Rendering goes through headless Chrome, which is already on this machine.
 */

import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 900;
const HEIGHT = 1200;

/** Colourways, keyed by the gown's own colour name. */
const PALETTES = {
  blush: ["#F7E4E4", "#E8C4C6", "#C89094"],
  ivory: ["#FBF6EC", "#EFE3D0", "#CDBB9E"],
  champagne: ["#F7EEDD", "#E7D4B4", "#C1A472"],
  navy: ["#E4E8F0", "#8E9DBC", "#2C3A5C"],
  emerald: ["#E2EFE7", "#8DBBA1", "#2F6B4B"],
  black: ["#ECECEE", "#A9A9B0", "#2A2A30"],
  red: ["#F8E5E3", "#DEA09A", "#9E3229"],
  default: ["#F4EFE8", "#DED2C2", "#A8917A"]
};

function paletteFor(color) {
  const key = (color ?? "").trim().toLowerCase();
  return PALETTES[key] ?? PALETTES.default;
}

/**
 * A stylised gown silhouette. Deliberately simple and abstract — it should read
 * as "photo not added yet", never be mistaken for the actual dress.
 */
function pageHtml(gown) {
  const [light, mid, deep] = paletteFor(gown.color);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { margin: 0 }
  html, body { margin: 0; padding: 0; width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(165deg, ${light} 0%, ${mid} 62%, ${deep} 140%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .glow {
    position: absolute; width: 780px; height: 780px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.55), rgba(255,255,255,0) 68%);
    top: -180px;
  }
  svg { position: relative; opacity: .5; }
  .tag {
    position: relative; margin-top: 44px; text-align: center;
    color: ${deep}; letter-spacing: .34em; text-transform: uppercase;
  }
  .num { font-size: 62px; font-weight: 700; letter-spacing: .1em; }
  .label { font-size: 19px; margin-top: 14px; opacity: .72; }
  .foot {
    position: absolute; bottom: 46px; font-size: 17px; letter-spacing: .22em;
    text-transform: uppercase; color: ${deep}; opacity: .45;
  }
</style></head><body>
  <div class="glow"></div>
  <svg width="360" height="560" viewBox="0 0 360 560" fill="none">
    <path d="M180 34c22 0 38 14 38 30 0 14-10 24-10 38 0 18 16 30 30 44 26 26 46 74 62 152 18 88 30 148 34 178 3 22-8 34-34 40-32 8-72 12-120 12s-88-4-120-12c-26-6-37-18-34-40 4-30 16-90 34-178 16-78 36-126 62-152 14-14 30-26 30-44 0-14-10-24-10-38 0-16 16-30 38-30z"
      fill="${deep}" fill-opacity=".26" stroke="${deep}" stroke-opacity=".4" stroke-width="3"/>
    <path d="M142 128c14 22 62 22 76 0" stroke="${deep}" stroke-opacity=".38" stroke-width="3" fill="none"/>
  </svg>
  <div class="tag">
    <div class="num">${gown.number}</div>
    <div class="label">${gown.color ?? ""}${gown.size ? ` · Size ${gown.size}` : ""}</div>
  </div>
  <div class="foot">Photo coming soon</div>
</body></html>`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function main() {
  const gowns = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const work = join(tmpdir(), `gown-placeholders-${randomUUID()}`);
  mkdirSync(work, { recursive: true });

  const statements = ["-- Placeholder photos. Delete a row when a real photo replaces it."];

  for (const gown of gowns) {
    const htmlPath = join(work, `${gown.number}.html`);
    const pngPath = join(work, `${gown.number}.png`);
    writeFileSync(htmlPath, pageHtml(gown));

    execFileSync(CHROME, [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--screenshot=${pngPath}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      `file://${htmlPath}`
    ], { stdio: "ignore" });

    // PNG stores gradients badly — several hundred KB each. JPEG takes the same
    // image to a few tens of KB, which matters when photos live in the database.
    const jpgPath = join(work, `${gown.number}.jpg`);
    execFileSync("/usr/bin/sips", [
      "-s", "format", "jpeg",
      "-s", "formatOptions", "82",
      pngPath, "--out", jpgPath
    ], { stdio: "ignore" });

    const bytes = readFileSync(jpgPath);
    const stamp = new Date().toISOString();

    statements.push(
      `INSERT INTO GownPhoto (id, gownId, filename, contentType, bytes, storage, data, storageKey, createdAt)`,
      `VALUES (${sqlString(randomUUID())}, ${sqlString(gown.id)}, ${sqlString(`placeholder-${gown.number}.jpg`)},`,
      `  'image/jpeg', ${bytes.byteLength}, 'DB', ${sqlString(bytes.toString("base64"))}, NULL, ${sqlString(stamp)});`
    );

    process.stderr.write(`${gown.number}: ${(bytes.byteLength / 1024).toFixed(0)} KB\n`);
  }

  rmSync(work, { recursive: true, force: true });
  console.log(statements.join("\n"));
}

main();

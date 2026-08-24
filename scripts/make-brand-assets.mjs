/**
 * Renders the brand assets into public/: the social card, the app icons and the
 * favicon. Run it again whenever the wordmark or palette changes.
 *
 *   node scripts/make-brand-assets.mjs "Elegant Rental" "Couture gowns, rented beautifully."
 *
 * Chrome does the rendering; sips does the resizing. Both are already here.
 */

import { execFileSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUBLIC = "public";

const BRAND = process.argv[2] ?? "Elegant Rental";
const TAGLINE = process.argv[3] ?? "Couture gowns, rented beautifully.";

const INK = "#14100D";
const GOLD = "#B08D57";
const IVORY = "#FAF7F2";

const FONT = `'Cormorant Garamond', 'Times New Roman', Georgia, serif`;
const SANS = `-apple-system, 'Helvetica Neue', Arial, sans-serif`;

/** The 1200×630 card used by every link preview. */
function ogHtml() {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1200px;height:630px}
  body{
    background:
      radial-gradient(130% 120% at 50% -20%, #2A221A 0%, ${INK} 62%);
    color:#FBF7F1; font-family:${SANS};
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
  }
  .halo{
    position:absolute; width:1100px; height:1100px; border-radius:50%; top:-620px;
    background:radial-gradient(circle, rgba(176,141,87,.30), rgba(176,141,87,0) 62%);
  }
  .rule{width:64px;height:1px;background:${GOLD};margin:0 0 30px}
  .eyebrow{
    position:relative; font-size:17px; letter-spacing:.52em; text-transform:uppercase;
    color:${GOLD}; font-weight:600; margin-bottom:26px;
  }
  h1{
    position:relative; font-family:${FONT}; font-weight:400; font-size:112px;
    letter-spacing:-.015em; margin:0; line-height:1;
  }
  p{
    position:relative; font-family:${FONT}; font-style:italic; font-size:34px;
    color:rgba(251,247,241,.74); margin:26px 0 0; font-weight:300;
  }
  .foot{
    position:absolute; bottom:44px; font-size:15px; letter-spacing:.34em;
    text-transform:uppercase; color:rgba(251,247,241,.42);
  }
</style>
<div class="halo"></div>
<div class="eyebrow">Atelier</div>
<h1>${BRAND}</h1>
<div class="rule" style="margin-top:34px"></div>
<p>${TAGLINE}</p>
<div class="foot">By appointment · Reserve by request</div>`;
}

/** Square mark: the initials, set in the display face, on ink. */
function iconHtml(size) {
  const initials = BRAND.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${size}px;height:${size}px}
  body{
    background:linear-gradient(150deg, #241C15 0%, ${INK} 70%);
    display:grid; place-items:center; position:relative;
  }
  .ring{
    position:absolute; inset:${size * 0.085}px; border:${Math.max(1, size * 0.012)}px solid ${GOLD};
    border-radius:${size * 0.2}px; opacity:.55;
  }
  span{
    font-family:${FONT}; font-weight:500; color:${GOLD};
    font-size:${size * 0.44}px; letter-spacing:.02em; line-height:1;
  }
</style><div class="ring"></div><span>${initials}</span>`;
}

/**
 * Wraps a PNG in an ICO container. Every browser since Vista reads PNG-in-ICO,
 * and sips segfaults doing this conversion itself.
 */
function icoFromPng(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.byteLength, 8);
  entry.writeUInt32LE(header.byteLength + entry.byteLength, 12);

  return Buffer.concat([header, entry, png]);
}

function shoot(work, name, html, width, height) {
  const htmlPath = join(work, `${name}.html`);
  const pngPath = join(work, `${name}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      `--screenshot=${pngPath}`,
      `--window-size=${width},${height}`,
      `file://${htmlPath}`
    ],
    { stdio: "ignore" }
  );
  return pngPath;
}

function main() {
  const work = join(tmpdir(), `brand-${randomUUID()}`);
  mkdirSync(work, { recursive: true });
  mkdirSync(PUBLIC, { recursive: true });

  // Social card — JPEG, because it's a photographic gradient.
  const og = shoot(work, "og", ogHtml(), 1200, 630);
  execFileSync("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "86", og, "--out", join(PUBLIC, "og.jpg")], { stdio: "ignore" });

  // Icons — PNG, because they need crisp edges.
  const icon512 = shoot(work, "icon512", iconHtml(512), 512, 512);
  copyFileSync(icon512, join(PUBLIC, "icon-512.png"));
  execFileSync("/usr/bin/sips", ["-z", "180", "180", icon512, "--out", join(PUBLIC, "apple-touch-icon.png")], { stdio: "ignore" });
  execFileSync("/usr/bin/sips", ["-z", "32", "32", icon512, "--out", join(PUBLIC, "favicon.png")], { stdio: "ignore" });
  writeFileSync(join(PUBLIC, "favicon.ico"), icoFromPng(readFileSync(join(PUBLIC, "favicon.png")), 32));

  // A vector mark too, so it stays sharp at any size.
  const initials = BRAND.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
  writeFileSync(
    join(PUBLIC, "icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${BRAND}">
  <rect width="512" height="512" rx="96" fill="${INK}"/>
  <rect x="44" y="44" width="424" height="424" rx="76" fill="none" stroke="${GOLD}" stroke-width="6" opacity=".55"/>
  <text x="256" y="256" fill="${GOLD}" font-family="Cormorant Garamond, Georgia, serif" font-size="225" font-weight="500"
        text-anchor="middle" dominant-baseline="central">${initials}</text>
</svg>`
  );

  rmSync(work, { recursive: true, force: true });
  console.log("wrote public/og.jpg, icon.svg, icon-512.png, apple-touch-icon.png, favicon.ico");
}

main();

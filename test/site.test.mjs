import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

function contrast(hexA, hexB) {
  const lin = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = lin((n >> 16) & 255);
    const g = lin((n >> 8) & 255);
    const b = lin(n & 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(hexA);
  const b = lum(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

test("the question, the sure page, and the celebration say the right things", () => {
  const index = read("index.html");
  const sure = read("sure.html");
  const yeayy = read("yeayy.html");
  assert.match(index, /<title>Would you be my girlfriend\?<\/title>/);
  assert.match(index, /class="ask-name"[^>]*>\s*Shania Dea Menany Soputan\s*</);
  assert.match(index, /<h1>\s*Would you be my girlfriend\?\s*<\/h1>/);
  assert.doesNotMatch(index, /Shania, would you be my girlfriend\?/);
  assert.match(index, /href="yeayy\.html"/);
  assert.match(index, /data-dodge="count"/);
  assert.match(index, /data-limit="5"/);
  assert.match(index, /data-next="sure\.html"/);
  assert.match(index, /viewport-fit=cover/);
  assert.match(index, /manifest\.webmanifest/);
  assert.match(sure, /Are you sure\?/);
  assert.match(sure, /data-dodge="endless"/);
  assert.match(sure, /href="index\.html"/);
  assert.match(yeayy, /<h1>\s*Yeayy!\s*<\/h1>/);
  assert.match(yeayy, /I'm so happyyy… I'm gonna die!/);
  assert.doesNotMatch(yeayy, /I am so happy/);
  for (const html of [index, sure, yeayy]) {
    assert.match(html, /<main[\s>]/);
    assert.match(html, /css\/styles\.css/);
    assert.match(html, /js\/app\.mjs/);
  }
});

test("styles respect safe areas, reduced motion, and the phone width", () => {
  const css = read("css/styles.css");
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /min-height:\s*3\.5rem/);
  assert.match(css, /\.ask-name\s*\{[^}]*font-family:\s*Fraunces/);
  assert.match(css, /\.ask-name\s*\{[^}]*text-wrap:\s*balance/);
  assert.match(css, /\.ask-name\s*\{[^}]*font-size:\s*clamp\(1\.55rem,\s*7\.2vw,\s*2\.35rem\)/);
  assert.match(css, /@media \(max-height:\s*500px\)\s*\{[\s\S]*?\.ask-name\s*\{[^}]*font-size:\s*1\.15rem/);
  assert.doesNotMatch(css, /100vw/);
  assert.doesNotMatch(css, /:hover[^{]*\{[^}]*?(left|top|transform:\s*translate)/s);
});

test("palette pairs used for text clear WCAG AA", () => {
  const css = read("css/styles.css");
  const value = (name) => {
    const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing --${name}`);
    return match[1];
  };
  assert.ok(contrast(value("ink"), value("paper")) >= 4.5);
  assert.ok(contrast(value("muted"), value("paper")) >= 4.5);
  assert.ok(contrast(value("yes-ink"), value("yes")) >= 4.5);
  assert.ok(contrast(value("no-ink"), value("no-bg")) >= 4.5);
});

test("the dodge is driven by pointer and keys, not hover", () => {
  const app = read("js/app.mjs");
  assert.match(app, /pointerdown/);
  assert.match(app, /visualViewport/);
  assert.match(app, /prefers-reduced-motion/);
  assert.match(app, /location\.assign/);
  assert.doesNotMatch(app, /mouseenter|mouseover|onmouseenter/);
});

test("the celebration page keeps a 16:9 inline player and no page CSP", () => {
  const index = read("index.html");
  const sure = read("sure.html");
  const yeayy = read("yeayy.html");
  const css = read("css/styles.css");
  const app = read("js/app.mjs");
  assert.match(yeayy, /I'm so happyyy… I'm gonna die![\s\S]*data-player/);
  assert.match(yeayy, /data-video="tt6FPKyQamk"/);
  assert.match(yeayy, /https:\/\/www\.youtube\.com\/watch\?v=tt6FPKyQamk/);
  assert.match(yeayy, /<noscript>[\s\S]*watch\?v=tt6FPKyQamk/);
  assert.match(yeayy, /Getting the video ready/);
  assert.match(yeayy, /Tap to play/);
  assert.doesNotMatch(index, /data-player/);
  assert.doesNotMatch(sure, /data-player/);
  for (const html of [index, sure, yeayy]) {
    assert.doesNotMatch(html, /Content-Security-Policy/i);
  }
  assert.match(css, /\.player-frame\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /\.player-frame\s*\{[^}]*border-radius:\s*1\.15rem/);
  assert.match(css, /46dvh \* 16 \/ 9/);
  assert.match(css, /\[data-view="tap-for-sound"\]/);
  assert.match(css, /\[data-view="tap-to-play"\]/);
  assert.match(app, /startCelebration\(/);
  assert.match(app, /\[data-player\]/);
  assert.match(app, /playsinline/);
  assert.match(app, /webkit-playsinline/);
  assert.match(app, /mutedFromPlayer\(/);
  assert.match(app, /soundGestureFollowUp\(/);
  assert.doesNotMatch(app, /getVolume/);
  const player = read("js/player.mjs");
  assert.match(player, /youtube-nocookie\.com/);
  assert.match(player, /playsinline/);
});

test("the question No button changes its name before the dodge measures it", () => {
  const index = read("index.html");
  const css = read("css/styles.css");
  const app = read("js/app.mjs");
  assert.match(index, /<button class="btn no" type="button" aria-label="No" data-dodge="count" data-limit="5" data-next="sure\.html">No<\/button>/);
  assert.match(css, /\.btn\.no[^{]*\{[^}]*white-space:\s*nowrap/);
  const press = app.slice(app.indexOf("const press = () =>"), app.indexOf("button.addEventListener"));
  const openAt = press.indexOf("result.openSure");
  const labelAt = press.indexOf("button.textContent = result.label");
  const nameAt = press.indexOf('button.setAttribute("aria-label", result.label)');
  const jumpAt = press.indexOf("jump(button)");
  assert.ok(openAt > -1 && labelAt > openAt && nameAt > labelAt && jumpAt > nameAt);
  assert.match(press, /refusalAfterTap\(count, limit\)/);
  const unlock = app.slice(app.indexOf("function readLabelSize"), app.indexOf("function placeClear"));
  const place = app.slice(app.indexOf("function placeClear"), app.indexOf("function jump"));
  const readAt = place.indexOf("readLabelSize(button)");
  const sizeAt = place.indexOf("placementSize(");
  const dodgeAt = place.indexOf("placeDodger(");
  assert.match(unlock, /width = "max-content"/);
  assert.ok(readAt > -1 && sizeAt > readAt && dodgeAt > sizeAt);
});

test("manifest and icons keep working in the rose palette", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "For Shania");
  assert.equal(manifest.short_name, "Shania");
  assert.equal(manifest.theme_color, "#9f1239");
  assert.equal(manifest.background_color, "#fff1f4");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.icons.some((icon) => icon.src === "icon-192.png"));
  assert.ok(manifest.icons.some((icon) => icon.src === "icon-512-maskable.png" && icon.purpose === "maskable"));
  assert.equal(fs.existsSync(".nojekyll"), true);
  for (const file of ["icon-180.png", "icon-192.png", "icon-512.png", "icon-512-maskable.png"]) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${file} is not a png`);
  }
});

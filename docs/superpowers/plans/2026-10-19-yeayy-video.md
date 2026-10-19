# Yeayy Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play `tt6FPKyQamk` under the Yeayy message with a privacy-enhanced YouTube embed, inline on iPhone, and a visible fallback when autoplay or embedding fails.

**Architecture:** `js/player.mjs` is a pure reducer and URL helper. `js/app.mjs` loads the IFrame API only when `yeayy.html` has `[data-player]`, creates the player on `https://www.youtube-nocookie.com`, and paints the view. Confetti and the dodge flow stay untouched.

**Tech Stack:** Static HTML, CSS, and ES modules. Tests run with `node --test`. No package.json and no build step.

## Global Constraints

- Video id `tt6FPKyQamk`. Watch URL `https://www.youtube.com/watch?v=tt6FPKyQamk`.
- Embed host `https://www.youtube-nocookie.com`. Player vars include `autoplay=1` and `playsinline=1`.
- The frame sits below `Yeayy!` and `I'm so happyyy… I'm gonna die!`, 16:9, radius `1.15rem`, width `min(100%, calc(46dvh * 16 / 9))`.
- Views: `loading`, `playing`, `tap-for-sound`, `tap-to-play`, `fallback`. Unmuted attempt waits 2500ms, muted attempt waits 2500ms, API wait is 8000ms.
- Embed errors 2, 5, 100, 101, and 150, any other player error, a script error, or a missed API all show the watch link.
- No Content-Security-Policy meta tag. Do not add `package.json`.
- Keep confetti, the fifth-No sure page, endless Yes on that page, and No returning home with a zero counter.
- Do not use `100vw`.

---

### Task 1: Player reducer

**Files:**
- Create: `js/player.mjs`
- Test: `test/player.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: `VIDEO_ID`, `WATCH_URL`, `NOCOOKIE_HOST`, `IFRAME_API_SRC`, `UNMUTED_WAIT_MS` (2500), `MUTED_WAIT_MS` (2500), `API_WAIT_MS` (8000), `embedSrc(videoId?)`, `playerVars()`, `createPlayerSession()`, `reducePlayer(session, event)`, `applyPlayerView(nodes, view)`

- [ ] **Step 1: Write the failing test**

Create `test/player.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  API_WAIT_MS,
  IFRAME_API_SRC,
  MUTED_WAIT_MS,
  NOCOOKIE_HOST,
  UNMUTED_WAIT_MS,
  VIDEO_ID,
  WATCH_URL,
  applyPlayerView,
  createPlayerSession,
  embedSrc,
  playerVars,
  reducePlayer,
} from "../js/player.mjs";

test("the embed URL is the privacy host with inline autoplay", () => {
  const url = new URL(embedSrc());
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.pathname, `/embed/${VIDEO_ID}`);
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("playsinline"), "1");
  assert.equal(url.searchParams.get("rel"), "0");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(WATCH_URL, "https://www.youtube.com/watch?v=tt6FPKyQamk");
  assert.equal(NOCOOKIE_HOST, "https://www.youtube-nocookie.com");
  assert.equal(IFRAME_API_SRC, "https://www.youtube.com/iframe_api");
  assert.equal(UNMUTED_WAIT_MS, 2500);
  assert.equal(MUTED_WAIT_MS, 2500);
  assert.equal(API_WAIT_MS, 8000);
  assert.deepEqual(playerVars(), {
    autoplay: 1,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
  });
});

function viewAfter(events) {
  let session = createPlayerSession();
  let action = null;
  for (const event of events) {
    const result = reducePlayer(session, event);
    session = result.session;
    action = result.action;
  }
  return { session, action };
}

test("a ready player tries sound, then muted playback, then a tap", () => {
  const started = viewAfter([{ type: "api-ready" }]);
  assert.equal(started.session.view, "loading");
  assert.equal(started.action, "play-unmuted");

  const muted = viewAfter([
    { type: "api-ready" },
    { type: "timeout", reason: "play" },
  ]);
  assert.equal(muted.session.view, "loading");
  assert.equal(muted.session.attempt, "muted");
  assert.equal(muted.action, "mute-and-play");

  const heard = viewAfter([
    { type: "api-ready" },
    { type: "timeout", reason: "play" },
    { type: "state", playing: true, muted: true },
  ]);
  assert.equal(heard.session.view, "tap-for-sound");

  const aloud = viewAfter([
    { type: "api-ready" },
    { type: "state", playing: true, muted: false },
  ]);
  assert.equal(aloud.session.view, "playing");

  const tapped = viewAfter([
    { type: "api-ready" },
    { type: "timeout", reason: "play" },
    { type: "timeout", reason: "play" },
  ]);
  assert.equal(tapped.session.view, "tap-to-play");
  assert.equal(tapped.action, null);

  const gesture = reducePlayer(tapped.session, { type: "user-play" });
  assert.equal(gesture.action, "unmute-and-play");
  assert.equal(gesture.session.view, "tap-to-play");
});

test("embed errors, a dead API, and a missed API show the watch link", () => {
  for (const code of [2, 5, 100, 101, 150, 999]) {
    const failed = viewAfter([{ type: "embed-error", code }]);
    assert.equal(failed.session.view, "fallback", `code ${code}`);
  }
  assert.equal(viewAfter([{ type: "api-failed" }]).session.view, "fallback");
  const late = viewAfter([{ type: "timeout", reason: "api" }]);
  assert.equal(late.session.view, "fallback");
  const ready = viewAfter([
    { type: "api-ready" },
    { type: "timeout", reason: "api" },
  ]);
  assert.equal(ready.session.view, "loading");
  assert.equal(ready.action, null);
});

test("a settled view ignores later play timeouts", () => {
  const playing = viewAfter([
    { type: "api-ready" },
    { type: "state", playing: true, muted: false },
    { type: "timeout", reason: "play" },
  ]);
  assert.equal(playing.session.view, "playing");
  assert.equal(playing.action, null);
});

test("the veil copy matches the view", () => {
  const nodes = () => ({
    veil: { hidden: true, dataset: {} },
    status: { hidden: true, textContent: "" },
    action: { hidden: true, textContent: "", dataset: {} },
    fallback: { hidden: true },
    frame: { dataset: {} },
  });
  const loading = nodes();
  applyPlayerView(loading, "loading");
  assert.equal(loading.veil.hidden, false);
  assert.equal(loading.status.textContent, "Getting the video ready…");
  assert.equal(loading.action.hidden, true);
  assert.equal(loading.fallback.hidden, true);
  assert.equal(loading.frame.dataset.view, "loading");

  const play = nodes();
  applyPlayerView(play, "tap-to-play");
  assert.equal(play.action.hidden, false);
  assert.equal(play.action.textContent, "Tap to play");
  assert.equal(play.veil.dataset.mode, "play");

  const sound = nodes();
  applyPlayerView(sound, "tap-for-sound");
  assert.equal(sound.action.textContent, "Tap for sound");
  assert.equal(sound.veil.dataset.mode, "sound");
  assert.equal(sound.fallback.hidden, true);

  const fallback = nodes();
  applyPlayerView(fallback, "fallback");
  assert.equal(fallback.fallback.hidden, false);
  assert.equal(fallback.veil.hidden, true);

  const live = nodes();
  applyPlayerView(live, "playing");
  assert.equal(live.veil.hidden, true);
  assert.equal(live.fallback.hidden, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/player.test.mjs`

Expected: FAIL because `../js/player.mjs` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `js/player.mjs` exporting the constants and functions above. `reducePlayer` returns `{ session, action }` where `action` is `null`, `"play-unmuted"`, `"mute-and-play"`, or `"unmute-and-play"`. Any `embed-error` or `api-failed` sets `view` to `"fallback"`. A `timeout` with `reason: "api"` falls back only when `apiReady` is false. A `timeout` with `reason: "play"` mutes on the first wait and sets `tap-to-play` on the second. Playing while muted sets `tap-for-sound`. Playing while unmuted sets `playing`. Timeouts do nothing once the view is `playing`, `tap-for-sound`, `tap-to-play`, or `fallback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/player.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/player.mjs test/player.test.mjs
git commit -m "Add a Yeayy player state machine for autoplay fallback."
```

### Task 2: Page, styles, and wiring

**Files:**
- Modify: `yeayy.html`
- Modify: `css/styles.css`
- Modify: `js/app.mjs`
- Modify: `test/site.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 exports
- Produces: `[data-player]` markup on `yeayy.html` only, and `mountCelebrationVideo` called from `js/app.mjs` after `startCelebration`

- [ ] **Step 1: Write the failing site assertions**

Extend `test/site.test.mjs` so Yeayy requires `data-player` after the happy line, `data-video="tt6FPKyQamk"`, the watch URL, a noscript link, `aspect-ratio: 16 / 9`, `border-radius: 1.15rem`, and `46dvh * 16 / 9`. Assert index and sure have no `data-player`, and that no HTML file adds a Content-Security-Policy meta tag. Assert `js/app.mjs` still calls `startCelebration` and queries `[data-player]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/site.test.mjs`

Expected: FAIL on the missing player markup.

- [ ] **Step 3: Implement markup, CSS, and DOM wiring**

Insert the player after the note in `yeayy.html`. Add the frame, veil, action button, hidden fallback, and noscript link. Style the 16:9 frame and the sound/play overlays. In `js/app.mjs`, import the player helpers and mount them only when `[data-player]` exists. Load `https://www.youtube.com/iframe_api`, construct `YT.Player` with `host: NOCOOKIE_HOST` and `playerVars()`, set `playsinline` and `webkit-playsinline` on the iframe, and dispatch reducer events. Keep `startCelebration()` unconditional.

- [ ] **Step 4: Run the full suite**

Run: `node --test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add yeayy.html css/styles.css js/app.mjs test/site.test.mjs README.md
git commit -m "Embed the celebration clip on the Yeayy page."
```

### Task 3: Review and phone check

- [ ] Review the diff against the spec before opening the pull request.
- [ ] Serve the site and capture 375×812, 360×800, and a short landscape of `yeayy.html`.
- [ ] Record whether the nocookie iframe actually loads.
- [ ] Re-run `node --test` after any fixes.

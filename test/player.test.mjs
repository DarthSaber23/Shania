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
  mutedFromPlayer,
  playerVars,
  reducePlayer,
  soundGestureFollowUp,
  stopYouTube,
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
  for (const code of [2, 5, 100, 999]) {
    const failed = viewAfter([{ type: "embed-error", code }]);
    assert.equal(failed.session.view, "fallback", `code ${code}`);
  }
  for (const code of [101, 150]) {
    const revealed = viewAfter([{ type: "embed-error", code }]);
    assert.equal(revealed.session.view, "playing", `code ${code} keeps the player visible`);
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

test("a late API still tries to play, and an embed error does not", () => {
  const late = viewAfter([
    { type: "timeout", reason: "api" },
    { type: "api-ready" },
  ]);
  assert.equal(late.session.view, "loading");
  assert.equal(late.action, "play-unmuted");

  const denied = viewAfter([
    { type: "embed-error", code: 100 },
    { type: "api-ready" },
  ]);
  assert.equal(denied.session.view, "fallback");
  assert.equal(denied.action, null);
});

test("tap for sound hides only after a successful unmute follow-up", () => {
  const quiet = viewAfter([
    { type: "api-ready" },
    { type: "state", playing: true, muted: true },
  ]);
  assert.equal(quiet.session.view, "tap-for-sound");
  const gesture = reducePlayer(quiet.session, { type: "user-play" });
  assert.equal(gesture.session.view, "tap-for-sound");
  assert.equal(gesture.action, "unmute-and-play");
  assert.equal(soundGestureFollowUp("tap-to-play", false), null);
  assert.equal(soundGestureFollowUp("tap-for-sound", true), null);
  const follow = soundGestureFollowUp(gesture.session.view, false);
  assert.deepEqual(follow, { type: "state", playing: true, muted: false });
  const heard = reducePlayer(gesture.session, follow);
  assert.equal(heard.session.view, "playing");
});

test("a thrown mute read keeps the sound prompt, and an embed error stays put", () => {
  assert.equal(mutedFromPlayer(() => false), false);
  assert.equal(mutedFromPlayer(() => true), true);
  assert.equal(mutedFromPlayer(() => {
    throw new Error("volume unavailable");
  }), true);
  const stuck = viewAfter([
    { type: "embed-error", code: 100 },
    { type: "state", playing: true, muted: false },
  ]);
  assert.equal(stuck.session.view, "fallback");
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

test("stopYouTube pauses, stops, and posts the iframe command", () => {
  const calls = [];
  const messages = [];
  stopYouTube({
    player: {
      pauseVideo() {
        calls.push("pause");
      },
      stopVideo() {
        calls.push("stop");
      },
    },
    postMessage(data, origin) {
      messages.push({ data, origin });
    },
  });
  assert.deepEqual(calls, ["pause", "stop"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, NOCOOKIE_HOST);
  assert.deepEqual(JSON.parse(messages[0].data), {
    event: "command",
    func: "stopVideo",
    args: "",
  });
});

test("stopYouTube still posts the command when the player throws", () => {
  const messages = [];
  stopYouTube({
    player: {
      pauseVideo() {
        throw new Error("gone");
      },
      stopVideo() {
        throw new Error("gone");
      },
    },
    postMessage(data, origin) {
      messages.push({ data, origin });
    },
  });
  assert.equal(messages.length, 1);
  assert.equal(JSON.parse(messages[0].data).func, "stopVideo");
});

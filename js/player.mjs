export const VIDEO_ID = "tt6FPKyQamk";
export const WATCH_URL = "https://www.youtube.com/watch?v=tt6FPKyQamk";
export const NOCOOKIE_HOST = "https://www.youtube-nocookie.com";
export const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
export const UNMUTED_WAIT_MS = 2500;
export const MUTED_WAIT_MS = 2500;
export const API_WAIT_MS = 8000;

const SETTLED = new Set(["playing", "tap-for-sound", "tap-to-play", "fallback"]);

export function embedSrc(videoId = VIDEO_ID) {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    enablejsapi: "1",
  });
  return `${NOCOOKIE_HOST}/embed/${videoId}?${params}`;
}

export function playerVars() {
  return {
    autoplay: 1,
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    enablejsapi: 1,
  };
}

export function mutedFromPlayer(isMuted) {
  try {
    return Boolean(isMuted());
  } catch {
    return true;
  }
}

export function soundGestureFollowUp(view, unmuteThrew) {
  if (view !== "tap-for-sound" || unmuteThrew) return null;
  return { type: "state", playing: true, muted: false };
}

export function createPlayerSession() {
  return {
    view: "loading",
    attempt: "unmuted",
    apiReady: false,
    failure: null,
  };
}

export function reducePlayer(session, event) {
  const next = { ...session };
  let action = null;

  if (event.type === "embed-error" && (event.code === 101 || event.code === 150)) {
    if (next.view !== "fallback") next.view = "playing";
    return { session: next, action };
  }

  if (event.type === "api-failed" || event.type === "embed-error") {
    next.view = "fallback";
    next.failure = event.type;
    return { session: next, action };
  }

  if (event.type === "api-ready") {
    next.apiReady = true;
    if (next.view === "fallback" && next.failure === "timeout") {
      next.view = "loading";
      next.failure = null;
    }
    if (next.view === "loading" && next.attempt === "unmuted") action = "play-unmuted";
    return { session: next, action };
  }

  if (event.type === "state") {
    if (next.view === "fallback") return { session: next, action };
    if (event.playing && event.muted) next.view = "tap-for-sound";
    else if (event.playing) next.view = "playing";
    return { session: next, action };
  }

  if (event.type === "timeout") {
    if (SETTLED.has(next.view)) return { session: next, action };
    if (event.reason === "api") {
      if (!next.apiReady) {
        next.view = "fallback";
        next.failure = "timeout";
      }
      return { session: next, action };
    }
    if (event.reason === "play") {
      if (!next.apiReady) return { session: next, action };
      if (next.attempt === "unmuted") {
        next.attempt = "muted";
        action = "mute-and-play";
        return { session: next, action };
      }
      next.view = "tap-to-play";
      return { session: next, action };
    }
  }

  if (event.type === "user-play") {
    action = "unmute-and-play";
    return { session: next, action };
  }

  return { session: next, action };
}

export function stopYouTube({ player, postMessage, origin = NOCOOKIE_HOST } = {}) {
  try {
    player?.pauseVideo?.();
  } catch {
    // A detached player can still be stopped through the iframe.
  }
  try {
    player?.stopVideo?.();
  } catch {
    // Same as above.
  }
  try {
    postMessage?.(JSON.stringify({
      event: "command",
      func: "stopVideo",
      args: "",
    }), origin);
  } catch {
    // The page is already locking.
  }
}

export function applyPlayerView(nodes, view) {
  const prompt = view === "loading" || view === "tap-to-play" || view === "tap-for-sound";
  nodes.frame.dataset.view = view;
  nodes.veil.hidden = !prompt;
  nodes.fallback.hidden = view !== "fallback";
  nodes.status.hidden = view !== "loading";
  nodes.action.hidden = view !== "tap-to-play" && view !== "tap-for-sound";
  if (view === "loading") {
    nodes.status.textContent = "Getting the video ready…";
    nodes.veil.dataset.mode = "loading";
  } else if (view === "tap-to-play") {
    nodes.action.textContent = "Tap to play";
    nodes.veil.dataset.mode = "play";
  } else if (view === "tap-for-sound") {
    nodes.action.textContent = "Tap for sound";
    nodes.veil.dataset.mode = "sound";
  } else {
    delete nodes.veil.dataset.mode;
  }
}

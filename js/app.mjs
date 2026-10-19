import { buildConfetti } from "./celebrate.mjs";
import { nextRefusal, placeDodger, rectsOverlap } from "./dodge.mjs";
import {
  API_WAIT_MS,
  IFRAME_API_SRC,
  MUTED_WAIT_MS,
  NOCOOKIE_HOST,
  UNMUTED_WAIT_MS,
  VIDEO_ID,
  applyPlayerView,
  createPlayerSession,
  mutedFromPlayer,
  playerVars,
  reducePlayer,
  soundGestureFollowUp,
} from "./player.mjs";

const GAP = 16;
const MARGIN = 8;
const MIN_TRAVEL = 96;

function readInsets() {
  const probe = document.getElementById("safe-probe");
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(probe);
  return {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
  };
}

function viewportBounds() {
  const insets = readInsets();
  const viewport = window.visualViewport;
  const originX = viewport ? viewport.offsetLeft : 0;
  const originY = viewport ? viewport.offsetTop : 0;
  const width = viewport ? viewport.width : window.innerWidth;
  const height = viewport ? viewport.height : window.innerHeight;
  return {
    left: originX + insets.left + MARGIN,
    top: originY + insets.top + MARGIN,
    right: originX + width - insets.right - MARGIN,
    bottom: originY + height - insets.bottom - MARGIN,
  };
}

function obstacleRects(button) {
  return [...document.querySelectorAll("[data-avoid]")]
    .filter((element) => element !== button)
    .map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    })
    .filter((box) => box.width > 0 && box.height > 0);
}

function detach(button) {
  if (button.classList.contains("is-fleeing")) return;
  const width = button.offsetWidth;
  const height = button.offsetHeight;
  const spacer = document.createElement("span");
  spacer.className = "choice-spacer";
  spacer.setAttribute("aria-hidden", "true");
  button.before(spacer);
  button.classList.add("is-fleeing");
  button.style.width = `${width}px`;
  button.style.height = `${height}px`;
}

function placeClear(button, previous, minTravel) {
  const bounds = viewportBounds();
  const obstacles = obstacleRects(button);
  let width = button.offsetWidth;
  let height = button.offsetHeight;
  const maxWidth = bounds.right - bounds.left;
  const maxHeight = bounds.bottom - bounds.top;
  if (maxWidth > 0 && width > maxWidth) width = maxWidth;
  if (maxHeight > 0 && height > maxHeight) height = maxHeight;
  const options = [
    { width, height, gap: GAP },
    { width: Math.min(width, 112), height, gap: GAP },
    { width: Math.min(width, 96), height: Math.min(height, 48), gap: 8 },
  ];
  for (const option of options) {
    if (!(option.width >= 48) || !(option.height >= 48)) continue;
    const pos = placeDodger({
      width: option.width,
      height: option.height,
      bounds,
      obstacles,
      gap: option.gap,
      previous,
      minTravel,
    });
    const mover = { x: pos.x, y: pos.y, width: option.width, height: option.height };
    const inside = pos.x >= bounds.left - 0.01
      && pos.y >= bounds.top - 0.01
      && pos.x + option.width <= bounds.right + 0.01
      && pos.y + option.height <= bounds.bottom + 0.01;
    const clear = obstacles.every((obstacle) => !rectsOverlap(mover, obstacle, option.gap));
    if (!inside || !clear) continue;
    button.style.minWidth = "0";
    button.style.minHeight = "0";
    button.style.width = `${option.width}px`;
    button.style.height = `${option.height}px`;
    button.style.left = `${pos.x}px`;
    button.style.top = `${pos.y}px`;
    return true;
  }
  const x = Math.min(Math.max(previous.x, bounds.left), Math.max(bounds.left, bounds.right - width));
  const y = Math.min(Math.max(previous.y, bounds.top), Math.max(bounds.top, bounds.bottom - height));
  button.style.width = `${width}px`;
  button.style.height = `${height}px`;
  button.style.left = `${x}px`;
  button.style.top = `${y}px`;
  return false;
}

function jump(button) {
  const before = button.getBoundingClientRect();
  detach(button);
  placeClear(button, { x: before.left, y: before.top }, MIN_TRAVEL);
}

function reclamp(button) {
  if (!button.classList.contains("is-fleeing")) return;
  const box = button.getBoundingClientRect();
  const bounds = viewportBounds();
  const width = button.offsetWidth;
  const height = button.offsetHeight;
  if (!(width > 0) || !(height > 0)) return;
  const x = Math.min(Math.max(box.left, bounds.left), Math.max(bounds.left, bounds.right - width));
  const y = Math.min(Math.max(box.top, bounds.top), Math.max(bounds.top, bounds.bottom - height));
  const mover = { x, y, width, height };
  const clear = obstacleRects(button).every((obstacle) => !rectsOverlap(mover, obstacle, GAP));
  const inside = x + width <= bounds.right + 0.5 && y + height <= bounds.bottom + 0.5;
  if (clear && inside) {
    if (x !== box.left || y !== box.top) {
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
    }
    return;
  }
  placeClear(button, { x: box.left, y: box.top }, 0);
}

function announce(text) {
  let status = document.getElementById("dodge-status");
  if (!status) {
    status = document.createElement("p");
    status.id = "dodge-status";
    status.className = "sr-only";
    status.setAttribute("aria-live", "polite");
    document.body.append(status);
  }
  status.textContent = "";
  window.setTimeout(() => {
    status.textContent = text;
  }, 30);
}

function bindDodger(button) {
  const mode = button.dataset.dodge;
  const limit = Number(button.dataset.limit || 5);
  const nextUrl = button.dataset.next || "sure.html";
  let count = 0;
  let shield = false;
  let leaving = false;
  let shieldTimer = 0;
  let ignoreClick = false;
  let ignoreTimer = 0;

  const markGesture = () => {
    ignoreClick = true;
    window.clearTimeout(ignoreTimer);
    ignoreTimer = window.setTimeout(() => {
      ignoreClick = false;
    }, 500);
  };

  const armShield = () => {
    shield = true;
    window.clearTimeout(shieldTimer);
    shieldTimer = window.setTimeout(() => {
      shield = false;
    }, 500);
  };

  const press = () => {
    if (leaving) return;
    if (mode === "count") {
      const result = nextRefusal(count, limit);
      count = result.count;
      if (result.openSure) {
        leaving = true;
        window.location.assign(nextUrl);
        return;
      }
    }
    jump(button);
    announce(`${button.textContent.trim()} slipped away`);
  };

  button.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      markGesture();
      armShield();
      press();
    },
    { passive: false },
  );

  button.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    markGesture();
    press();
  });

  button.addEventListener("click", (event) => {
    if (ignoreClick) {
      ignoreClick = false;
      event.preventDefault();
      return;
    }
    press();
  });

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!button.contains(event.target)) shield = false;
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (!shield) return;
      event.preventDefault();
      event.stopPropagation();
      shield = false;
    },
    true,
  );

  window.addEventListener("resize", () => reclamp(button));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => reclamp(button));
    window.visualViewport.addEventListener("scroll", () => reclamp(button));
  }
}

function startCelebration() {
  const layer = document.querySelector("[data-celebrate]");
  if (!layer) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const piece of buildConfetti(36)) {
    const node = document.createElement("span");
    node.className = piece.heart ? "piece heart" : "piece";
    node.textContent = piece.heart ? "♥" : "";
    node.style.left = `${piece.left}%`;
    node.style.animationDelay = `${piece.delay}s`;
    node.style.animationDuration = `${piece.duration}s`;
    node.style.color = piece.color;
    node.style.background = piece.heart ? "transparent" : piece.color;
    node.style.setProperty("--size", `${piece.size}px`);
    node.style.setProperty("--drift", `${piece.drift}px`);
    node.style.setProperty("--spin", `${piece.rotate}deg`);
    layer.append(node);
    node.addEventListener("animationend", () => node.remove(), { once: true });
  }
}

window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

function prepareFrame(target) {
  const iframe = target.getIframe?.();
  if (!iframe) return;
  iframe.setAttribute("playsinline", "1");
  iframe.setAttribute("webkit-playsinline", "1");
  const allow = new Set(
    (iframe.getAttribute("allow") || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  allow.add("autoplay");
  allow.add("encrypted-media");
  allow.add("picture-in-picture");
  iframe.setAttribute("allow", [...allow].join("; "));
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.title = "It's so fluffy I'm gonna die!";
}

function mountCelebrationVideo(root) {
  const slot = root.querySelector("[data-yt-slot]");
  const nodes = {
    veil: root.querySelector("[data-player-veil]"),
    status: root.querySelector("[data-player-status]"),
    action: root.querySelector("[data-player-action]"),
    fallback: root.querySelector("[data-player-fallback]"),
    frame: root.querySelector("[data-player-frame]"),
  };
  if (!slot || !nodes.veil || !nodes.status || !nodes.action || !nodes.fallback || !nodes.frame) return;

  let session = createPlayerSession();
  let player = null;
  let playTimer = 0;
  let apiTimer = 0;
  let started = false;

  const paint = () => applyPlayerView(nodes, session.view);

  const schedulePlayTimeout = () => {
    window.clearTimeout(playTimer);
    const wait = session.attempt === "muted" ? MUTED_WAIT_MS : UNMUTED_WAIT_MS;
    playTimer = window.setTimeout(() => dispatch({ type: "timeout", reason: "play" }), wait);
  };

  const runAction = (action) => {
    if (!player || !action) return;
    if (action === "play-unmuted") {
      player.unMute?.();
      player.playVideo?.();
      schedulePlayTimeout();
      return;
    }
    if (action === "mute-and-play") {
      player.mute?.();
      player.playVideo?.();
      schedulePlayTimeout();
      return;
    }
        if (action === "unmute-and-play") {
          const view = session.view;
          let unmuteThrew = false;
          try {
            player.unMute?.();
          } catch {
            unmuteThrew = true;
          }
          try {
            player.playVideo?.();
          } catch {
            // A paused player can still start on the next tap.
          }
          const follow = soundGestureFollowUp(view, unmuteThrew);
          if (!follow) return;
          window.setTimeout(() => {
            if (session.view !== "tap-for-sound") return;
            dispatch(follow);
          }, 0);
        }
  };

  const dispatch = (event) => {
    const result = reducePlayer(session, event);
    session = result.session;
    paint();
    if (session.view !== "loading") window.clearTimeout(playTimer);
    runAction(result.action);
  };

  nodes.action.addEventListener("click", () => dispatch({ type: "user-play" }));
  paint();

  apiTimer = window.setTimeout(() => dispatch({ type: "timeout", reason: "api" }), API_WAIT_MS);

  const begin = () => {
    if (started) return;
    started = true;
    try {
      const vars = playerVars();
      if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        vars.origin = window.location.origin;
      }
      new window.YT.Player(slot, {
        videoId: root.dataset.video || VIDEO_ID,
        host: NOCOOKIE_HOST,
        playerVars: vars,
        events: {
          onReady: (event) => {
            window.clearTimeout(apiTimer);
            player = event.target;
            prepareFrame(player);
            dispatch({ type: "api-ready" });
          },
          onStateChange: (event) => {
            player = event.target;
            const playing = event.data === 1;
            const muted = mutedFromPlayer(() => event.target.isMuted());
            dispatch({ type: "state", playing, muted });
          },
          onError: (event) => {
            window.clearTimeout(apiTimer);
            window.clearTimeout(playTimer);
            dispatch({ type: "embed-error", code: Number(event.data) });
          },
        },
      });
    } catch {
      window.clearTimeout(apiTimer);
      dispatch({ type: "api-failed" });
    }
  };

  window.onYouTubeIframeAPIReady = begin;
  if (window.YT && window.YT.Player) {
    begin();
    return;
  }
  window.YTConfig = { host: NOCOOKIE_HOST };
  const script = document.createElement("script");
  script.src = IFRAME_API_SRC;
  script.async = true;
  script.onerror = () => {
    window.clearTimeout(apiTimer);
    dispatch({ type: "api-failed" });
  };
  document.head.append(script);
}

const dodger = document.querySelector("[data-dodge]");
if (dodger) bindDodger(dodger);
startCelebration();
const celebration = document.querySelector("[data-player]");
if (celebration) mountCelebrationVideo(celebration);

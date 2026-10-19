import { buildConfetti } from "./celebrate.mjs";
import { nextRefusal, placeDodger, rectsOverlap } from "./dodge.mjs";

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
    .filter((element) => element !== button && !element.contains(button))
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
  document.body.append(button);
  button.classList.add("is-fleeing");
  button.style.width = `${width}px`;
  button.style.height = `${height}px`;
}

function jump(button) {
  const before = button.getBoundingClientRect();
  detach(button);
  const bounds = viewportBounds();
  let width = button.offsetWidth || before.width;
  let height = button.offsetHeight || before.height;
  const maxWidth = bounds.right - bounds.left;
  const maxHeight = bounds.bottom - bounds.top;
  if (width > maxWidth && maxWidth > 0) {
    width = maxWidth;
    button.style.width = `${width}px`;
  }
  if (height > maxHeight && maxHeight > 0) {
    height = maxHeight;
    button.style.height = `${height}px`;
  }
  const pos = placeDodger({
    width,
    height,
    bounds,
    obstacles: obstacleRects(button),
    gap: GAP,
    previous: { x: before.left, y: before.top },
    minTravel: MIN_TRAVEL,
  });
  button.style.left = `${pos.x}px`;
  button.style.top = `${pos.y}px`;
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
  const pos = placeDodger({
    width,
    height,
    bounds,
    obstacles: obstacleRects(button),
    gap: GAP,
    previous: { x: box.left, y: box.top },
    minTravel: 0,
  });
  button.style.left = `${pos.x}px`;
  button.style.top = `${pos.y}px`;
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
      armShield();
      press();
    },
    { passive: false },
  );

  button.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
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

const dodger = document.querySelector("[data-dodge]");
if (dodger) bindDodger(dodger);
startCelebration();

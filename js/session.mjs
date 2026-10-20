import { wibStamp } from "./notify.mjs";

export const INACTIVITY_MS = 15 * 60 * 1000;
export const ABSOLUTE_MS = 60 * 60 * 1000;
export const ACTIVITY_PERSIST_MS = 5_000;
export const ACTIVITY_EVENTS = ["touchstart", "pointerdown", "keydown", "scroll", "click"];
export const SESSION_KEY = "shania.gate.session";
export const EXPIRY_NOTICE_KEY = "shania.gate.expiryNotice";
export const EXPIRY_TITLE = "Sesi verifikasi habis";

function limitLabel(ms) {
  if (ms % 60_000 === 0) return `${ms / 60_000} menit`;
  if (ms % 1_000 === 0) return `${ms / 1_000} detik`;
  return `${ms} ms`;
}

export function expiryBody(reason, at, {
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
} = {}) {
  const time = wibStamp(at);
  if (reason === "inactive") {
    return `Sesi habis karena tidak aktif ${limitLabel(inactivityMs)} · ${time}`;
  }
  if (reason === "absolute") {
    return `Sesi habis karena batas ${limitLabel(absoluteMs)} · ${time}`;
  }
  return "";
}

export function expiryReason(session, now, {
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
} = {}) {
  if (!session) return null;
  const { verifiedAt, lastActivityAt } = session;
  if (typeof verifiedAt !== "number" || typeof lastActivityAt !== "number") return null;
  const inactiveAt = lastActivityAt + inactivityMs;
  const absoluteAt = verifiedAt + absoluteMs;
  const inactive = now >= inactiveAt;
  const absolute = now >= absoluteAt;
  if (inactive && absolute) return inactiveAt <= absoluteAt ? "inactive" : "absolute";
  if (absolute) return "absolute";
  if (inactive) return "inactive";
  return null;
}

export function readSession(storage) {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data?.verifiedAt !== "number" || typeof data?.lastActivityAt !== "number") return null;
    return { verifiedAt: data.verifiedAt, lastActivityAt: data.lastActivityAt };
  } catch {
    return null;
  }
}

export function writeSession(storage, session) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({
      verifiedAt: session.verifiedAt,
      lastActivityAt: session.lastActivityAt,
    }));
    return true;
  } catch {
    return false;
  }
}

export function hasExpiryNotice(storage) {
  try {
    return Boolean(storage?.getItem(EXPIRY_NOTICE_KEY));
  } catch {
    return false;
  }
}

export function claimExpiryNotice(storage, token) {
  const owner = `${token}:${Date.now()}:${Math.random()}`;
  try {
    const current = storage.getItem(EXPIRY_NOTICE_KEY);
    if (current === token || (current && current.startsWith(`${token}:`))) return false;
    storage.setItem(EXPIRY_NOTICE_KEY, owner);
    return storage.getItem(EXPIRY_NOTICE_KEY) === owner;
  } catch {
    return false;
  }
}

function shorter(raw, max) {
  if (raw == null || raw === "") return max;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > max) return max;
  return Math.floor(value);
}

export function resolveDurations(search = "", {
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
} = {}) {
  const params = new URLSearchParams(search);
  return {
    inactivityMs: shorter(params.get("inactivityMs"), inactivityMs),
    absoluteMs: shorter(params.get("absoluteMs"), absoluteMs),
  };
}

export function createSessionController({
  storage,
  now = () => Date.now(),
  setTimeout: setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimeout: clearTimer = (id) => clearTimeout(id),
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
  enforce,
  onExpire,
} = {}) {
  let memoryActivity = null;
  let idleTimer = 0;
  let absoluteTimer = 0;
  let running = false;

  const clearTimers = () => {
    clearTimer(idleTimer);
    clearTimer(absoluteTimer);
    idleTimer = 0;
    absoluteTimer = 0;
  };

  const flush = (force) => {
    const session = readSession(storage);
    if (!session || memoryActivity == null) return;
    if (memoryActivity <= session.lastActivityAt) return;
    if (now() >= memoryActivity + inactivityMs) return;
    if (!force && memoryActivity - session.lastActivityAt < ACTIVITY_PERSIST_MS) return;
    writeSession(storage, {
      verifiedAt: session.verifiedAt,
      lastActivityAt: memoryActivity,
    });
  };

  const schedule = () => {
    clearTimers();
    if (!running) return;
    const session = readSession(storage);
    if (!session) return;
    const t = now();
    const last = memoryActivity == null
      ? session.lastActivityAt
      : Math.max(memoryActivity, session.lastActivityAt);
    idleTimer = setTimer(() => tick(), Math.max(0, last + inactivityMs - t));
    absoluteTimer = setTimer(() => tick(), Math.max(0, session.verifiedAt + absoluteMs - t));
  };

  const tick = () => {
    if (!running) return;
    flush(true);
    const result = enforce();
    if (result.ok) {
      schedule();
      return;
    }
    running = false;
    clearTimers();
    onExpire(result);
  };

  return {
    start() {
      running = true;
      memoryActivity = null;
      const result = enforce();
      if (!result.ok) {
        running = false;
        clearTimers();
        onExpire(result);
        return;
      }
      schedule();
    },
    stop() {
      running = false;
      clearTimers();
    },
    noteActivity() {
      if (!running) return;
      memoryActivity = now();
      flush(false);
      schedule();
    },
    persist() {
      if (!running) return;
      flush(true);
    },
    check() {
      tick();
    },
  };
}

import { TOPIC, wibStamp } from "./notify.mjs";
import {
  ABSOLUTE_MS,
  ACTIVITY_EVENTS,
  EXPIRY_NOTICE_KEY,
  EXPIRY_TITLE,
  INACTIVITY_MS,
  SESSION_KEY,
  claimExpiryNotice,
  createSessionController,
  expiryBody,
  expiryReason,
  hasExpiryNotice,
  readSession,
  resolveDurations,
  writeSession,
} from "./session.mjs";

export const WA_NUMBER = "";
export const COOLDOWN_MS = 60_000;
export const CODE_LENGTH = 8;
export const VERIFIED_KEY = "shania.gate.verified";
export const PENDING_KEY = "shania.gate.pending";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_TITLE = "Kode verifikasi Shania";
const WRONG_TITLE = "Kode verifikasi salah";
const PRIORITY = "high";

export const COPY = {
  send: "Kirim kode verifikasi",
  resend: "Kirim ulang kode",
  note: "Kode belum masuk? Chat Fajar di WhatsApp ya 😊",
  mismatch: "Kodenya belum cocok. Coba lagi pelan-pelan ya.",
  empty: "Masukin kodenya dulu ya.",
  network: "Kodenya belum terkirim. Chat Fajar di WhatsApp ya 😊",
  storage: "Halaman ini tidak bisa menyimpan kodenya. Chat Fajar di WhatsApp ya 😊",
  sent: "Kode sudah dikirim. Masukin di sini ya.",
  expired: "Sesi kamu habis, minta kode baru ya 😊",
  countdown(label) {
    return `Kirim ulang dalam ${label}`;
  },
};

export function codeFromBytes(bytes) {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return code;
}

export function randomCode(getRandomValues = (bytes) => crypto.getRandomValues(bytes)) {
  const bytes = new Uint8Array(CODE_LENGTH);
  getRandomValues(bytes);
  return codeFromBytes(bytes);
}

export function normalizeCode(value) {
  return String(value ?? "").trim();
}

export function cooldownRemaining(pending, now) {
  if (!pending) return 0;
  const until = Number(pending.cooldownUntil);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - now);
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function whatsAppNote(number = WA_NUMBER) {
  const digits = String(number ?? "").replace(/\D/g, "");
  return {
    text: COPY.note,
    href: digits ? `https://wa.me/${digits}` : "",
  };
}

export function noticeUrl(topic, title, priority) {
  const params = new URLSearchParams();
  params.set("title", title);
  params.set("priority", priority);
  return `${topic}?${params.toString()}`;
}

export function codeBody(code, at = new Date()) {
  return `Kode: ${code} · ${wibStamp(at)}`;
}

export function wrongBody(at = new Date()) {
  return `Shania memasukkan kode yang tidak cocok · ${wibStamp(at)}`;
}

function canStore(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return false;
  }
  try {
    storage.getItem(VERIFIED_KEY);
    return true;
  } catch {
    return false;
  }
}

const PROBE_KEY = "shania.gate.probe";

function canWrite(storage) {
  try {
    storage.setItem(PROBE_KEY, "1");
  } catch {
    return false;
  }
  try {
    storage.removeItem(PROBE_KEY);
  } catch {
    // The write worked. A leftover probe key does not block the gate.
  }
  return true;
}

export function readPending(storage) {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.code !== "string" || data.code.length !== CODE_LENGTH) return null;
    const cooldownUntil = Number(data.cooldownUntil);
    return {
      code: data.code,
      cooldownUntil: Number.isFinite(cooldownUntil) ? cooldownUntil : 0,
    };
  } catch {
    return null;
  }
}

function writePending(storage, pending) {
  try {
    storage.setItem(PENDING_KEY, JSON.stringify({
      code: pending.code,
      cooldownUntil: pending.cooldownUntil,
    }));
    return true;
  } catch {
    return false;
  }
}

async function postNotice(fetchImpl, topic, title, body) {
  const response = await fetchImpl(noticeUrl(topic, title, PRIORITY), {
    method: "POST",
    body,
    mode: "cors",
    keepalive: true,
  });
  return Boolean(response && response.ok);
}

function clearVerifiedState(storage) {
  try {
    storage?.removeItem(VERIFIED_KEY);
  } catch {
    // The page still has to hide once the session is no longer trustworthy.
  }
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    // Same as above.
  }
}

export function createGate({
  fetchImpl,
  storage,
  topic = TOPIC,
  now = () => Date.now(),
  date = () => new Date(),
  randomCode: mint,
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
} = {}) {
  const nextCode = mint || (() => randomCode());
  const durations = { inactivityMs, absoluteMs };

  return {
    isVerified() {
      try {
        if (storage?.getItem(VERIFIED_KEY) !== "1") return false;
        const session = readSession(storage);
        if (!session) return false;
        return expiryReason(session, now(), durations) === null;
      } catch {
        return false;
      }
    },
    pending() {
      return readPending(storage);
    },
    async sendCode() {
      if (!canStore(storage) || !canWrite(storage)) {
        return { ok: false, reason: "storage", message: COPY.storage };
      }
      const current = readPending(storage);
      const remaining = cooldownRemaining(current, now());
      if (current && remaining > 0) {
        return { ok: false, reason: "cooldown", remaining };
      }
      const code = nextCode();
      try {
        const posted = await postNotice(fetchImpl, topic, CODE_TITLE, codeBody(code, date()));
        if (!posted) return { ok: false, reason: "network", message: COPY.network };
      } catch {
        return { ok: false, reason: "network", message: COPY.network };
      }
      const saved = writePending(storage, {
        code,
        cooldownUntil: now() + COOLDOWN_MS,
      });
      if (!saved) return { ok: false, reason: "storage", message: COPY.storage };
      return { ok: true };
    },
    async check(value) {
      const typed = normalizeCode(value);
      if (!typed) return { ok: false, reason: "empty", message: COPY.empty };
      const pending = readPending(storage);
      if (!pending || typed !== pending.code) {
        if (pending) {
          postNotice(fetchImpl, topic, WRONG_TITLE, wrongBody(date())).catch(() => {});
        }
        return { ok: false, reason: "mismatch", message: COPY.mismatch };
      }
      const at = now();
      try {
        storage.setItem(VERIFIED_KEY, "1");
        storage.removeItem(PENDING_KEY);
        storage.removeItem(EXPIRY_NOTICE_KEY);
        if (!writeSession(storage, { verifiedAt: at, lastActivityAt: at })) {
          throw new Error("session");
        }
      } catch {
        clearVerifiedState(storage);
        return { ok: false, reason: "storage", message: COPY.storage };
      }
      return { ok: true };
    },
    enforce() {
      let flagged = false;
      try {
        flagged = storage?.getItem(VERIFIED_KEY) === "1";
      } catch {
        return { ok: false, reason: "storage", notified: false };
      }
      if (!flagged) return { ok: false, reason: "signed-out", notified: false };
      const session = readSession(storage);
      if (!session) {
        clearVerifiedState(storage);
        return { ok: false, reason: "invalid", notified: false };
      }
      const reason = expiryReason(session, now(), durations);
      if (!reason) return { ok: true, session };
      const notified = claimExpiryNotice(storage, String(session.verifiedAt));
      clearVerifiedState(storage);
      if (notified) {
        const body = expiryBody(reason, date(), durations);
        postNotice(fetchImpl, topic, EXPIRY_TITLE, body).catch(() => {});
      }
      return { ok: false, reason, notified };
    },
  };
}

function setMessage(node, message) {
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
}

function applyNote(documentRef, element, number) {
  if (!element) return;
  const note = whatsAppNote(number);
  element.textContent = "";
  if (!note.href) {
    element.textContent = note.text;
    return;
  }
  const link = documentRef.createElement("a");
  link.href = note.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = note.text;
  element.append(link);
}

export function mountGate({
  documentRef = globalThis.document,
  onUnlock,
  onLock,
  onResume,
  storage,
  fetchImpl,
  waNumber = WA_NUMBER,
  now = () => Date.now(),
  date = () => new Date(),
  topic = TOPIC,
  inactivityMs = INACTIVITY_MS,
  absoluteMs = ABSOLUTE_MS,
} = {}) {
  const view = documentRef?.defaultView || globalThis;
  const durations = resolveDurations(view.location?.search || "", { inactivityMs, absoluteMs });
  const gate = createGate({
    storage,
    fetchImpl,
    waNumber,
    now,
    date,
    topic,
    inactivityMs: durations.inactivityMs,
    absoluteMs: durations.absoluteMs,
  });
  const root = documentRef?.querySelector?.("[data-verify-gate]");
  const main = documentRef?.getElementById?.("page-main");
  if (!root || !documentRef) {
    if (gate.isVerified()) onUnlock?.();
    return gate;
  }

  const html = documentRef.documentElement;
  const previousTitle = documentRef.title;
  let opened = false;
  let booted = false;
  let watching = false;
  let sending = false;
  let timerId = 0;

  const sendButton = root.querySelector("[data-gate-send]");
  const resendButton = root.querySelector("[data-gate-resend]");
  const form = root.querySelector("[data-gate-form]");
  const input = root.querySelector("[data-gate-code]");
  const sendError = root.querySelector("[data-gate-send-error]");
  const formError = root.querySelector("[data-gate-error]");
  const timer = root.querySelector("[data-gate-timer]");
  const expiredNode = root.querySelector("[data-gate-expired]");

  const stopPaint = () => {
    if (!timerId) return;
    view.clearInterval(timerId);
    timerId = 0;
  };

  const paint = () => {
    const remaining = cooldownRemaining(gate.pending(), now());
    if (resendButton) resendButton.disabled = sending || remaining > 0;
    if (sendButton) sendButton.disabled = sending;
    if (!timer) return;
    if (remaining > 0) {
      const label = COPY.countdown(formatCountdown(remaining));
      timer.hidden = false;
      if (timer.textContent !== label) timer.textContent = label;
    } else if (!timer.hidden || timer.textContent) {
      timer.hidden = true;
      timer.textContent = "";
    }
  };

  const startPaint = () => {
    paint();
    if (!timerId) timerId = view.setInterval(paint, 250);
  };

  const controller = createSessionController({
    storage,
    now,
    setTimeout: (fn, ms) => view.setTimeout(fn, ms),
    clearTimeout: (id) => view.clearTimeout(id),
    inactivityMs: durations.inactivityMs,
    absoluteMs: durations.absoluteMs,
    enforce: () => gate.enforce(),
    onExpire: (result) => {
      const expired = result.reason === "inactive"
        || result.reason === "absolute"
        || result.reason === "invalid"
        || hasExpiryNotice(storage);
      lock({ expired });
    },
  });

  const reveal = () => {
    if (opened) return;
    opened = true;
    watching = true;
    stopPaint();
    html.classList.remove("is-gated", "has-code");
    html.classList.add("is-verified");
    main?.removeAttribute("inert");
    root.setAttribute("hidden", "");
    setMessage(expiredNode, "");
    documentRef.title = previousTitle;
    controller.start();
    if (!watching) return;
    if (!booted) {
      booted = true;
      onUnlock?.();
      return;
    }
    onResume?.();
  };

  const lock = ({ expired }) => {
    watching = false;
    opened = false;
    controller.stop();
    if (booted) {
      try {
        onLock?.();
      } catch {
        // Stopping the video must not leave the page visible.
      }
    }
    html.classList.add("is-gated");
    html.classList.remove("is-verified", "has-code");
    main?.setAttribute("inert", "");
    root.removeAttribute("hidden");
    documentRef.title = "Verifikasi dulu ya";
    setMessage(expiredNode, expired ? COPY.expired : "");
    applyNote(documentRef, root.querySelector("[data-gate-wa]"), waNumber);
    startPaint();
    try {
      sendButton?.focus({ preventScroll: true });
    } catch {
      // Focus is a convenience. The gate is already on screen.
    }
  };

  const presentGate = ({ expired }) => {
    html.classList.add("is-gated");
    html.classList.remove("is-verified");
    if (gate.pending()) html.classList.add("has-code");
    else html.classList.remove("has-code");
    main?.setAttribute("inert", "");
    root.removeAttribute("hidden");
    documentRef.title = "Verifikasi dulu ya";
    setMessage(expiredNode, expired ? COPY.expired : "");
    applyNote(documentRef, root.querySelector("[data-gate-wa]"), waNumber);
    startPaint();
  };

  const onActivity = () => {
    if (!watching) return;
    if (documentRef.visibilityState === "hidden") return;
    controller.noteActivity();
  };
  for (const type of ACTIVITY_EVENTS) {
    documentRef.addEventListener(type, onActivity, { capture: true, passive: true });
  }
  documentRef.addEventListener("visibilitychange", () => {
    if (!watching) return;
    if (documentRef.visibilityState === "hidden") controller.persist();
    else controller.check();
  });
  view.addEventListener?.("pagehide", () => {
    if (!watching) return;
    controller.persist();
  });
  view.addEventListener?.("storage", (event) => {
    if (!watching || !event) return;
    if (event.key !== SESSION_KEY && event.key !== VERIFIED_KEY && event.key !== EXPIRY_NOTICE_KEY) return;
    controller.check();
  });

  const requestCode = async () => {
    if (sending) return;
    sending = true;
    paint();
    try {
      const result = await gate.sendCode();
      if (result.ok || result.reason === "cooldown") {
        html.classList.add("has-code");
        setMessage(sendError, "");
        if (result.ok) setMessage(formError, "");
        input?.focus();
      } else {
        const message = result.message || COPY.network;
        if (html.classList.contains("has-code")) setMessage(formError, message);
        else setMessage(sendError, message);
      }
    } finally {
      sending = false;
      paint();
    }
  };

  sendButton?.addEventListener("click", () => {
    requestCode();
  });
  resendButton?.addEventListener("click", () => {
    requestCode();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    sending = true;
    paint();
    try {
      const result = await gate.check(input?.value);
      if (result.ok) {
        reveal();
        return;
      }
      setMessage(formError, result.message || COPY.mismatch);
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
    } finally {
      sending = false;
      paint();
    }
  });
  input?.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
  });
  input?.addEventListener("focus", () => {
    view.setTimeout(() => {
      try {
        input.scrollIntoView({ block: "center" });
      } catch {
        // Older browsers can refuse the options object.
      }
    }, 300);
  });

  let flagged = false;
  try {
    flagged = storage?.getItem(VERIFIED_KEY) === "1";
  } catch {
    flagged = false;
  }
  if (flagged) {
    const result = gate.enforce();
    if (result.ok) reveal();
    else lock({ expired: true });
  } else {
    presentGate({ expired: hasExpiryNotice(storage) });
  }
  return gate;
}

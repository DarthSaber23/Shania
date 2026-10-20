import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { TOPIC, wibStamp } from "../js/notify.mjs";
import {
  COOLDOWN_MS,
  COPY,
  WA_NUMBER,
  codeBody,
  codeFromBytes,
  cooldownRemaining,
  createGate,
  formatCountdown,
  mountGate,
  noticeUrl,
  randomCode,
  whatsAppNote,
  wrongBody,
} from "../js/gate.mjs";

const AT = new Date("2026-10-19T16:51:00.000Z");
const TIME = wibStamp(AT);

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    dump() {
      return { ...data };
    },
  };
}

function harness(options = {}) {
  const calls = [];
  let now = options.start ?? 1_000_000;
  const codes = [...(options.codes || ["Ab12Cd34", "Zy98Xw76"])];
  const fetchImpl = options.fetchImpl || (async (url, init) => {
    calls.push({ url, init });
    return { ok: options.ok !== false };
  });
  const gate = createGate({
    fetchImpl,
    storage: Object.hasOwn(options, "storage") ? options.storage : memoryStorage(),
    topic: TOPIC,
    now: () => now,
    date: () => AT,
    randomCode: () => {
      const next = codes.shift();
      if (!next) throw new Error("no scripted code");
      return next;
    },
    waNumber: Object.hasOwn(options, "waNumber") ? options.waNumber : WA_NUMBER,
  });
  return {
    calls,
    gate,
    storage: options.storage,
    advance(ms) {
      now += ms;
    },
  };
}

function posted(call) {
  const url = new URL(call.url);
  return {
    topic: `${url.origin}${url.pathname}`,
    title: url.searchParams.get("title"),
    priority: url.searchParams.get("priority"),
    body: call.init.body,
    method: call.init.method,
    mode: call.init.mode,
    keepalive: call.init.keepalive,
    headers: call.init.headers,
  };
}

test("an 8-byte crypto buffer maps onto the alphanumeric alphabet", () => {
  assert.equal(codeFromBytes(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])), "ABCDEFGH");
  assert.equal(codeFromBytes(Uint8Array.from([25, 26, 51, 52, 61, 62, 63, 255])), "Zaz09ABH");
  assert.match(codeFromBytes(Uint8Array.from([10, 20, 30, 40, 50, 60, 70, 80])), /^[A-Za-z0-9]{8}$/);
});

test("randomCode fills exactly 8 bytes through crypto.getRandomValues", () => {
  const seen = [];
  const code = randomCode((bytes) => {
    seen.push(bytes);
    bytes.set([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  assert.equal(seen.length, 1);
  assert.ok(seen[0] instanceof Uint8Array);
  assert.equal(seen[0].length, 8);
  assert.equal(code, "ABCDEFGH");
});

test("the code post uses the existing topic, a clear title, and high priority", async () => {
  const box = harness();
  const result = await box.gate.sendCode();
  assert.equal(result.ok, true);
  assert.equal(box.calls.length, 1);
  const post = posted(box.calls[0]);
  assert.equal(post.topic, TOPIC);
  assert.equal(post.title, "Kode verifikasi Shania");
  assert.equal(post.priority, "high");
  assert.equal(post.body, codeBody("Ab12Cd34", AT));
  assert.equal(post.body, `Kode: Ab12Cd34 · ${TIME}`);
  assert.equal(post.method, "POST");
  assert.equal(post.mode, "cors");
  assert.equal(post.keepalive, true);
  assert.equal(post.headers, undefined);
  assert.equal(noticeUrl(TOPIC, "Kode verifikasi Shania", "high"), box.calls[0].url);
});

test("a resend during the cooldown keeps the current code", async () => {
  const storage = memoryStorage();
  const box = harness({ storage, codes: ["Ab12Cd34", "Zz90Qq11"] });
  await box.gate.sendCode();
  const blocked = await box.gate.sendCode();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "cooldown");
  assert.equal(blocked.remaining, COOLDOWN_MS);
  assert.equal((await box.gate.check("Zz90Qq11")).reason, "mismatch");
  assert.equal(box.gate.isVerified(), false);
  assert.equal(box.gate.pending().code, "Ab12Cd34");
});

test("only the newest code matches after a successful resend", async () => {
  const storage = memoryStorage();
  const box = harness({ storage, codes: ["Ab12Cd34", "Qq12Ww34"] });
  await box.gate.sendCode();
  box.advance(COOLDOWN_MS);
  const resent = await box.gate.sendCode();
  assert.equal(resent.ok, true);
  assert.equal((await box.gate.check("Ab12Cd34")).reason, "mismatch");
  assert.equal(box.gate.isVerified(), false);
  assert.equal((await box.gate.check("Qq12Ww34")).ok, true);
});

test("a refresh keeps the pending code and the remaining cooldown", async () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  await box.gate.sendCode();
  const restored = createGate({
    fetchImpl: async () => ({ ok: true }),
    storage,
    now: () => 1_000_000 + 1_000,
    date: () => AT,
    randomCode: () => "Qq12Ww34",
  });
  assert.equal(restored.pending().code, "Ab12Cd34");
  assert.equal(cooldownRemaining(restored.pending(), 1_000_000 + 1_000), COOLDOWN_MS - 1_000);
  assert.equal((await restored.check("Ab12Cd34")).ok, true);
  assert.equal(restored.isVerified(), true);
});

test("a failed send keeps the previous code and does not start a new cooldown", async () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  await box.gate.sendCode();
  box.advance(COOLDOWN_MS);
  const callsBefore = box.calls.length;
  const failed = harness({
    storage,
    start: 1_000_000 + COOLDOWN_MS,
    codes: ["Zz90Qq11"],
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  const result = await failed.gate.sendCode();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "network");
  assert.match(result.message, /Chat Fajar di WhatsApp/);
  assert.doesNotMatch(result.message, /Radit/);
  assert.equal(JSON.parse(storage.dump()["shania.gate.pending"]).code, "Ab12Cd34");
  assert.equal(box.calls.length, callsBefore);

  const rejected = harness({
    storage,
    start: 1_000_000 + COOLDOWN_MS,
    fetchImpl: async (url, init) => {
      box.calls.push({ url, init });
      return { ok: false };
    },
  });
  const httpFail = await rejected.gate.sendCode();
  assert.equal(httpFail.ok, false);
  assert.equal(httpFail.reason, "network");
  assert.equal(JSON.parse(storage.dump()["shania.gate.pending"]).code, "Ab12Cd34");
});

test("a wrong code shows a gentle reason and posts a mismatch notice", async () => {
  const box = harness();
  await box.gate.sendCode();
  const empty = await box.gate.check("   ");
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "empty");
  assert.equal(box.calls.length, 1);

  const wrong = await box.gate.check("nope1234");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "mismatch");
  assert.equal(wrong.message, COPY.mismatch);
  assert.equal(box.gate.isVerified(), false);
  assert.equal(box.calls.length, 2);
  const post = posted(box.calls[1]);
  assert.equal(post.title, "Kode verifikasi salah");
  assert.equal(post.priority, "high");
  assert.equal(post.body, wrongBody(AT));
  assert.equal(post.body, `Shania memasukkan kode yang tidak cocok · ${TIME}`);
  assert.doesNotMatch(post.body, /nope1234/);
  assert.equal(post.method, "POST");
  assert.equal(post.headers, undefined);
});

test("a mismatch notice that fails still reports the gentle error", async () => {
  const calls = [];
  const gate = createGate({
    storage: memoryStorage(),
    date: () => AT,
    now: () => 5_000,
    randomCode: () => "Ab12Cd34",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (calls.length > 1) throw new Error("offline");
      return { ok: true };
    },
  });
  await gate.sendCode();
  const wrong = await gate.check("zzzzzzzz");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "mismatch");
  assert.equal(wrong.message, COPY.mismatch);
  assert.equal(gate.isVerified(), false);
});

test("verification sticks in localStorage and clears the pending code", async () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  await box.gate.sendCode();
  assert.equal((await box.gate.check("  Ab12Cd34  ")).ok, true);
  assert.equal(storage.dump()["shania.gate.verified"], "1");
  assert.equal(storage.dump()["shania.gate.pending"], undefined);
  assert.equal(box.gate.isVerified(), true);
  const later = createGate({
    storage,
    fetchImpl: async () => ({ ok: true }),
    now: () => 1_000_000,
  });
  assert.equal(later.isVerified(), true);
});

test("the cooldown lasts 60 seconds and formats a visible countdown", () => {
  assert.equal(COOLDOWN_MS, 60_000);
  assert.equal(formatCountdown(60_000), "1:00");
  assert.equal(formatCountdown(1_001), "0:02");
  assert.equal(formatCountdown(1_000), "0:01");
  assert.equal(formatCountdown(0), "0:00");
  assert.equal(COPY.countdown("1:00"), "Kirim ulang dalam 1:00");
});

test("the WhatsApp note names Fajar and links only when a number is set", () => {
  assert.equal(WA_NUMBER, "");
  assert.equal(COPY.note, "Kode belum masuk? Chat Fajar di WhatsApp ya 😊");
  assert.deepEqual(whatsAppNote(""), {
    text: "Kode belum masuk? Chat Fajar di WhatsApp ya 😊",
    href: "",
  });
  assert.deepEqual(whatsAppNote("+62 812-000"), {
    text: "Kode belum masuk? Chat Fajar di WhatsApp ya 😊",
    href: "https://wa.me/62812000",
  });
  assert.match(COPY.network, /Chat Fajar di WhatsApp ya 😊/);
  assert.doesNotMatch(`${COPY.note} ${COPY.network} ${COPY.storage} ${COPY.mismatch}`, /Radit/);
});

test("a storage write failure does not publish a code", async () => {
  const calls = [];
  const saved = JSON.stringify({ code: "Ab12Cd34", cooldownUntil: 0 });
  const storage = {
    getItem(key) {
      return key === "shania.gate.pending" ? saved : null;
    },
    setItem() {
      throw new Error("quota");
    },
    removeItem() {
      throw new Error("quota");
    },
  };
  const gate = createGate({
    storage,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    },
    randomCode: () => "Zz90Qq11",
    now: () => 5_000,
    date: () => AT,
  });
  const result = await gate.sendCode();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage");
  assert.match(result.message, /Chat Fajar di WhatsApp/);
  assert.equal(calls.length, 0);
  assert.equal(gate.pending().code, "Ab12Cd34");
});

test("a wrong code reports before the mismatch notice settles", async () => {
  let calls = 0;
  const gate = createGate({
    storage: memoryStorage(),
    now: () => 5_000,
    date: () => AT,
    randomCode: () => "Ab12Cd34",
    fetchImpl: () => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ ok: true });
      return new Promise(() => {});
    },
  });
  await gate.sendCode();
  const wrong = await gate.check("zzzzzzzz");
  assert.equal(wrong.ok, false);
  assert.equal(wrong.reason, "mismatch");
  assert.equal(wrong.message, COPY.mismatch);
  assert.equal(calls, 2);
  assert.equal(gate.isVerified(), false);
});

test("blocked storage does not publish a code", async () => {
  const gate = createGate({
    storage: undefined,
    fetchImpl: async () => {
      throw new Error("should not post");
    },
    randomCode: () => "Ab12Cd34",
  });
  const result = await gate.sendCode();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage");
  assert.match(result.message, /Fajar/);
});

test("the three pages share the gate and boot the old flow only after unlock", () => {
  const gate = fs.readFileSync("js/gate.mjs", "utf8");
  const app = fs.readFileSync("js/app.mjs", "utf8");
  const css = fs.readFileSync("css/styles.css", "utf8");
  const note = "Kode belum masuk? Chat Fajar di WhatsApp ya 😊";
  const blocks = ["index.html", "sure.html", "yeayy.html"].map((file) => {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /Kirim kode verifikasi/);
    assert.match(html, /Kirim ulang kode/);
    assert.match(html, new RegExp(note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, /shania\.gate\.verified/);
    assert.match(html, /shania\.gate\.pending/);
    assert.match(html, /id="page-main"/);
    assert.match(html, /data-verify-gate/);
    assert.doesNotMatch(html, /Radit/);
    const section = html.match(/<section class="gate scene"[\s\S]*?<\/section>/);
    assert.ok(section, `${file} is missing the gate card`);
    return section[0];
  });
  assert.equal(blocks[0], blocks[1]);
  assert.equal(blocks[1], blocks[2]);
  assert.match(blocks[0], /onsubmit="return false"/);
  assert.doesNotMatch(blocks[0], /aria-live/);
  assert.doesNotMatch(gate, /Radit/);
  assert.match(css, /html\.is-gated\s+#page-main/);
  assert.match(css, /html\.is-gated\s+\.burst/);
  assert.match(css, /\.gate-code\s*\{[^}]*font-size:\s*1\.125rem/);
  assert.match(css, /html\.has-code\s+\.gate-form/);
  const boot = app.slice(app.indexOf("function bootExperience"));
  assert.match(boot, /bootNotifier\(notifier\)/);
  assert.match(boot, /bindDodger\(dodger\)/);
  assert.match(boot, /startCelebration\(\)/);
  assert.match(boot, /mountCelebrationVideo\(celebration\)/);
  assert.doesNotMatch(app.slice(0, app.indexOf("function bootExperience")), /bootNotifier\(notifier\)/);
  assert.equal(COPY.expired, "Sesi kamu habis, minta kode baru ya 😊");
  assert.match(app, /mountGate\(/);
  assert.match(app, /onUnlock:\s*bootExperience/);
  assert.match(app, /onLock:\s*stopCelebrationVideo/);
  assert.match(app, /onResume:\s*allowCelebrationVideo/);
  assert.match(app, /stopYouTube/);
  assert.match(gate, /Sesi kamu habis, minta kode baru ya 😊/);
  for (const file of ["index.html", "sure.html", "yeayy.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.match(html, /data-gate-expired/);
    assert.match(html, /var INACTIVITY_MS = 15 \* 60 \* 1000;/);
    assert.match(html, /var ABSOLUTE_MS = 60 \* 60 \* 1000;/);
    assert.match(html, /shania\.gate\.session/);
  }
});

test("a correct code stores the session and a stale session is not verified", async () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  await box.gate.sendCode();
  assert.equal((await box.gate.check("Ab12Cd34")).ok, true);
  assert.equal(typeof storage.dump()["shania.gate.session"], "string");
  const session = JSON.parse(storage.dump()["shania.gate.session"]);
  assert.deepEqual(session, { verifiedAt: 1_000_000, lastActivityAt: 1_000_000 });
  const stale = createGate({
    storage,
    fetchImpl: async () => ({ ok: true }),
    now: () => 1_000_000 + 15 * 60 * 1000,
    date: () => AT,
  });
  assert.equal(stale.isVerified(), false);
  const fresh = createGate({
    storage,
    fetchImpl: async () => ({ ok: true }),
    now: () => 1_000_000 + 15 * 60 * 1000 - 1,
    date: () => AT,
  });
  assert.equal(fresh.isVerified(), true);
});

test("enforce posts one reason and a reload stays quiet", () => {
  const calls = [];
  const storage = memoryStorage({
    "shania.gate.verified": "1",
    "shania.gate.session": JSON.stringify({ verifiedAt: 5_000, lastActivityAt: 5_000 }),
  });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  const gate = createGate({
    storage,
    now: () => 5_000 + 15 * 60 * 1000,
    date: () => AT,
    fetchImpl,
  });
  const first = gate.enforce();
  assert.equal(first.ok, false);
  assert.equal(first.reason, "inactive");
  assert.equal(first.notified, true);
  assert.equal(storage.dump()["shania.gate.verified"], undefined);
  assert.equal(storage.dump()["shania.gate.session"], undefined);
  assert.equal(calls.length, 1);
  const post = posted(calls[0]);
  assert.equal(post.title, "Sesi verifikasi habis");
  assert.equal(post.priority, "high");
  assert.equal(post.body, `Sesi habis karena tidak aktif 15 menit · ${TIME}`);
  assert.equal(post.method, "POST");
  assert.equal(post.mode, "cors");
  assert.equal(post.keepalive, true);
  assert.equal(post.headers, undefined);
  assert.equal(post.topic, TOPIC);
  assert.equal(gate.enforce().notified, false);
  const reloaded = createGate({
    storage,
    now: () => 5_000 + 60 * 60 * 1000,
    date: () => AT,
    fetchImpl,
  });
  assert.equal(reloaded.enforce().notified, false);
  assert.equal(calls.length, 1);
});

test("an active session posts the 60 minute limit and a thrown post still locks", async () => {
  const calls = [];
  const storage = memoryStorage({
    "shania.gate.verified": "1",
    "shania.gate.session": JSON.stringify({
      verifiedAt: 0,
      lastActivityAt: 50 * 60 * 1000,
    }),
  });
  const gate = createGate({
    storage,
    now: () => 60 * 60 * 1000,
    date: () => AT,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      throw new Error("offline");
    },
  });
  const result = gate.enforce();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "absolute");
  assert.equal(result.notified, true);
  assert.equal(storage.dump()["shania.gate.verified"], undefined);
  assert.equal(calls.length, 1);
  assert.equal(posted(calls[0]).body, `Sesi habis karena batas 60 menit · ${TIME}`);
});

test("a verified flag without a session locks without a notice", () => {
  const calls = [];
  const storage = memoryStorage({ "shania.gate.verified": "1" });
  const gate = createGate({
    storage,
    now: () => 5_000,
    fetchImpl: async () => {
      calls.push("nope");
      return { ok: true };
    },
  });
  const result = gate.enforce();
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid");
  assert.equal(result.notified, false);
  assert.equal(calls.length, 0);
  assert.equal(storage.dump()["shania.gate.verified"], undefined);
  assert.equal(gate.isVerified(), false);
});

function classList() {
  const names = new Set();
  return {
    add(...items) {
      for (const item of items) names.add(item);
    },
    remove(...items) {
      for (const item of items) names.delete(item);
    },
    contains(item) {
      return names.has(item);
    },
  };
}

function mountDocument({ search = "" } = {}) {
  const timers = new Map();
  let seq = 1;
  let now = 1_000_000;
  const listeners = new Map();

  function listen(type, fn, options) {
    const capture = options === true || options?.capture === true;
    const key = `${type}:${capture}`;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
  }

  function node(id) {
    return {
      id,
      hidden: false,
      textContent: "",
      attrs: {},
      classList: classList(),
      children: [],
      setAttribute(name, value) {
        this.attrs[name] = String(value);
        if (name === "hidden") this.hidden = true;
      },
      removeAttribute(name) {
        delete this.attrs[name];
        if (name === "hidden") this.hidden = false;
      },
      addEventListener(type, fn) {
        if (!this.local) this.local = [];
        this.local.push({ type, fn });
      },
      querySelector(sel) {
        return find(this, sel);
      },
      focus() {
        this.focused = true;
      },
      scrollIntoView() {},
    };
  }

  function find(current, sel) {
    if (current.attrs && Object.prototype.hasOwnProperty.call(current.attrs, sel.slice(1, -1)) && sel.startsWith("[")) {
      return current;
    }
    if (sel.startsWith("#") && current.id === sel.slice(1)) return current;
    for (const child of current.children || []) {
      const found = find(child, sel);
      if (found) return found;
    }
    return null;
  }

  const expired = node("");
  expired.attrs["data-gate-expired"] = "";
  expired.hidden = true;
  const wa = node("");
  wa.attrs["data-gate-wa"] = "";
  const send = node("");
  send.attrs["data-gate-send"] = "";
  const resend = node("");
  resend.attrs["data-gate-resend"] = "";
  const form = node("");
  form.attrs["data-gate-form"] = "";
  const input = node("");
  input.attrs["data-gate-code"] = "";
  const sendError = node("");
  sendError.attrs["data-gate-send-error"] = "";
  const formError = node("");
  formError.attrs["data-gate-error"] = "";
  const timer = node("");
  timer.attrs["data-gate-timer"] = "";
  const root = node("");
  root.attrs["data-verify-gate"] = "";
  root.children = [expired, wa, send, resend, form, input, sendError, formError, timer];
  const main = node("page-main");
  const html = node("");
  const documentRef = node("");
  documentRef.children = [root, main];
  documentRef.documentElement = html;
  documentRef.title = "Would you be my girlfriend?";
  documentRef.visibilityState = "visible";
  documentRef.createElement = () => node("");
  documentRef.addEventListener = listen;
  documentRef.getElementById = (id) => find(documentRef, `#${id}`);
  documentRef.querySelector = (sel) => find(documentRef, sel);
  const view = {
    location: { search },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout(fn, ms) {
      const id = seq;
      seq += 1;
      timers.set(id, { fn, at: now + Number(ms) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener: listen,
    removeEventListener() {},
  };
  documentRef.defaultView = view;

  return {
    documentRef,
    html,
    root,
    main,
    expired,
    listeners,
    now: () => now,
    pass(ms) {
      now += ms;
    },
    advance(ms) {
      now += ms;
      for (;;) {
        const due = [...timers.values()].filter((item) => item.at <= now);
        if (!due.length) return;
        due.sort((a, b) => a.at - b.at);
        const next = due[0];
        const id = [...timers.entries()].find(([, item]) => item === next)?.[0];
        timers.delete(id);
        next.fn();
      }
    },
    dispatch(type) {
      for (const fn of listeners.get(`${type}:true`) || []) fn({ type });
      for (const fn of listeners.get(`${type}:false`) || []) fn({ type });
    },
  };
}

test("an idle page shows the gate again without a second notice", () => {
  const calls = [];
  const page = mountDocument({ search: "?inactivityMs=1000&absoluteMs=5000" });
  const storage = memoryStorage({
    "shania.gate.verified": "1",
    "shania.gate.session": JSON.stringify({ verifiedAt: 1_000_000, lastActivityAt: 1_000_000 }),
  });
  let unlocked = 0;
  let locked = 0;
  mountGate({
    documentRef: page.documentRef,
    storage,
    now: page.now,
    date: () => AT,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    },
    onUnlock() {
      unlocked += 1;
    },
    onLock() {
      locked += 1;
    },
  });
  page.advance(999);
  assert.equal(locked, 0);
  assert.equal(unlocked, 1);
  assert.equal(page.html.classList.contains("is-verified"), true);
  page.advance(1);
  assert.equal(locked, 1);
  assert.equal(unlocked, 1);
  assert.equal(page.html.classList.contains("is-gated"), true);
  assert.equal(page.html.classList.contains("is-verified"), false);
  assert.equal(page.root.hidden, false);
  assert.equal(page.main.attrs.inert, "");
  assert.equal(page.expired.hidden, false);
  assert.equal(page.expired.textContent, COPY.expired);
  assert.equal(page.documentRef.title, "Verifikasi dulu ya");
  assert.equal(calls.length, 1);
  assert.match(posted(calls[0]).body, /tidak aktif 1 detik/);

  const again = mountDocument();
  mountGate({
    documentRef: again.documentRef,
    storage,
    now: () => 1_000_000 + 5_000,
    date: () => AT,
    fetchImpl: async () => {
      calls.push({ again: true });
      return { ok: true };
    },
    onUnlock() {
      unlocked += 1;
    },
    onLock() {
      locked += 1;
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(again.expired.textContent, COPY.expired);
  assert.equal(again.html.classList.contains("is-gated"), true);
  assert.equal(unlocked, 1);
});

test("showing the page after a locked phone is not treated as activity", () => {
  const calls = [];
  const page = mountDocument({ search: "?inactivityMs=1000&absoluteMs=60000" });
  const storage = memoryStorage({
    "shania.gate.verified": "1",
    "shania.gate.session": JSON.stringify({ verifiedAt: 1_000_000, lastActivityAt: 1_000_000 }),
  });
  let locked = 0;
  mountGate({
    documentRef: page.documentRef,
    storage,
    now: page.now,
    date: () => AT,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    },
    onLock() {
      locked += 1;
    },
  });
  page.pass(100);
  page.dispatch("click");
  page.pass(1_000);
  page.documentRef.visibilityState = "hidden";
  page.dispatch("visibilitychange");
  page.documentRef.visibilityState = "visible";
  page.dispatch("visibilitychange");
  assert.equal(locked, 1);
  assert.equal(page.expired.textContent, COPY.expired);
  assert.equal(calls.length, 1);
  assert.equal(page.html.classList.contains("is-gated"), true);
});

test("entering a new code after expiry resumes the page once", async () => {
  const page = mountDocument({ search: "?inactivityMs=1000&absoluteMs=60000" });
  const storage = memoryStorage({
    "shania.gate.verified": "1",
    "shania.gate.session": JSON.stringify({ verifiedAt: 1_000_000, lastActivityAt: 1_000_000 }),
  });
  let unlocked = 0;
  let resumed = 0;
  mountGate({
    documentRef: page.documentRef,
    storage,
    now: page.now,
    date: () => AT,
    fetchImpl: async () => ({ ok: true }),
    onUnlock() {
      unlocked += 1;
    },
    onResume() {
      resumed += 1;
    },
  });
  page.advance(1_000);
  assert.equal(page.html.classList.contains("is-gated"), true);
  storage.setItem("shania.gate.pending", JSON.stringify({ code: "Ab12Cd34", cooldownUntil: 0 }));
  const input = page.documentRef.querySelector("[data-gate-code]");
  const form = page.documentRef.querySelector("[data-gate-form]");
  input.value = "Ab12Cd34";
  const submit = form.local.find((item) => item.type === "submit").fn;
  await submit({ preventDefault() {} });
  assert.equal(unlocked, 1);
  assert.equal(resumed, 1);
  assert.equal(page.html.classList.contains("is-verified"), true);
  assert.equal(page.expired.hidden, true);
});

test("the activity listeners cover touch, pointer, keys, scroll, and click", () => {
  const page = mountDocument();
  mountGate({
    documentRef: page.documentRef,
    storage: memoryStorage(),
    now: page.now,
    fetchImpl: async () => ({ ok: true }),
  });
  for (const type of ["touchstart", "pointerdown", "keydown", "scroll", "click"]) {
    assert.ok(page.listeners.has(`${type}:true`), type);
  }
  assert.ok(page.listeners.has("visibilitychange:false"));
});

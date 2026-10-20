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
  const later = createGate({ storage, fetchImpl: async () => ({ ok: true }) });
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
  assert.match(app, /mountGate\(/);
  assert.match(app, /onUnlock:\s*bootExperience/);
});

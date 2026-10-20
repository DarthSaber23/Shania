import assert from "node:assert/strict";
import test from "node:test";
import { wibStamp } from "../js/notify.mjs";
import {
  ABSOLUTE_MS,
  ACTIVITY_EVENTS,
  ACTIVITY_PERSIST_MS,
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
} from "../js/session.mjs";

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

function clock() {
  let now = 0;
  const timers = new Map();
  let seq = 1;
  const runDue = () => {
    for (;;) {
      const due = [...timers.values()].filter((timer) => timer && timer.at <= now);
      if (!due.length) return;
      due.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = due[0];
      timers.delete(next.id);
      next.fn();
    }
  };
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = seq;
      seq += 1;
      timers.set(id, { id, fn, at: now + Number(ms) });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      runDue();
    },
    pass(ms) {
      now += ms;
    },
  };
}

test("the idle and absolute limits are 15 and 60 minutes", () => {
  assert.equal(INACTIVITY_MS, 15 * 60 * 1000);
  assert.equal(ABSOLUTE_MS, 60 * 60 * 1000);
  assert.equal(ACTIVITY_PERSIST_MS, 5_000);
  assert.deepEqual(ACTIVITY_EVENTS, ["touchstart", "pointerdown", "keydown", "scroll", "click"]);
  assert.equal(SESSION_KEY, "shania.gate.session");
  assert.equal(EXPIRY_NOTICE_KEY, "shania.gate.expiryNotice");
  assert.equal(EXPIRY_TITLE, "Sesi verifikasi habis");
});

test("a session expires at exactly 15 idle minutes and stays open one millisecond earlier", () => {
  const session = { verifiedAt: 0, lastActivityAt: 0 };
  assert.equal(expiryReason(session, INACTIVITY_MS - 1), null);
  assert.equal(expiryReason(session, INACTIVITY_MS), "inactive");
  assert.equal(expiryReason(session, 50 * 60 * 1000), "inactive");
});

test("an active session still expires at exactly 60 minutes", () => {
  const session = { verifiedAt: 0, lastActivityAt: 50 * 60 * 1000 };
  assert.equal(expiryReason(session, ABSOLUTE_MS - 1), null);
  assert.equal(expiryReason(session, ABSOLUTE_MS), "absolute");
});

test("when both limits have passed, the earlier deadline is the reason", () => {
  assert.equal(expiryReason({ verifiedAt: 0, lastActivityAt: 0 }, 2 * ABSOLUTE_MS), "inactive");
  assert.equal(expiryReason({
    verifiedAt: 0,
    lastActivityAt: 50 * 60 * 1000,
  }, ABSOLUTE_MS), "absolute");
});

test("the ntfy body names the limit that fired", () => {
  assert.equal(expiryBody("inactive", AT), `Sesi habis karena tidak aktif 15 menit · ${TIME}`);
  assert.equal(expiryBody("absolute", AT), `Sesi habis karena batas 60 menit · ${TIME}`);
  assert.equal(
    expiryBody("inactive", AT, { inactivityMs: 2_000, absoluteMs: ABSOLUTE_MS }),
    `Sesi habis karena tidak aktif 2 detik · ${TIME}`,
  );
  assert.equal(expiryBody("other", AT), "");
  assert.doesNotMatch(`${expiryBody("inactive", AT)} ${expiryBody("absolute", AT)}`, /Radit/);
});

test("a session record keeps numeric timestamps and ignores junk", () => {
  const storage = memoryStorage();
  assert.equal(writeSession(storage, { verifiedAt: 10, lastActivityAt: 12, extra: "no" }), true);
  assert.deepEqual(readSession(storage), { verifiedAt: 10, lastActivityAt: 12 });
  assert.equal(JSON.parse(storage.dump()[SESSION_KEY]).extra, undefined);
  storage.setItem(SESSION_KEY, "{");
  assert.equal(readSession(storage), null);
  storage.setItem(SESSION_KEY, JSON.stringify({ verifiedAt: "10", lastActivityAt: 12 }));
  assert.equal(readSession(storage), null);
});

test("the same verification can claim only one expiry notice", () => {
  const storage = memoryStorage();
  assert.equal(claimExpiryNotice(storage, "1000"), true);
  assert.equal(claimExpiryNotice(storage, "1000"), false);
  assert.equal(hasExpiryNotice(storage), true);
  assert.equal(claimExpiryNotice(storage, "2000"), true);
  assert.equal(hasExpiryNotice(memoryStorage()), false);
});

test("a query string can shorten a duration and cannot lengthen it", () => {
  assert.deepEqual(resolveDurations(""), { inactivityMs: INACTIVITY_MS, absoluteMs: ABSOLUTE_MS });
  assert.deepEqual(resolveDurations("?inactivityMs=1500&absoluteMs=60000"), {
    inactivityMs: 1500,
    absoluteMs: 60_000,
  });
  assert.deepEqual(resolveDurations("?inactivityMs=999999999&absoluteMs=0"), {
    inactivityMs: INACTIVITY_MS,
    absoluteMs: ABSOLUTE_MS,
  });
  assert.deepEqual(resolveDurations("?inactivityMs=nope"), {
    inactivityMs: INACTIVITY_MS,
    absoluteMs: ABSOLUTE_MS,
  });
});

test("the controller expires a stale session immediately and does not notify twice", () => {
  const time = clock();
  const storage = memoryStorage();
  writeSession(storage, { verifiedAt: 0, lastActivityAt: 0 });
  const reasons = [];
  const controller = createSessionController({
    storage,
    now: time.now,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    inactivityMs: 1_000,
    absoluteMs: 5_000,
    enforce: () => {
      const session = readSession(storage);
      const reason = expiryReason(session, time.now(), { inactivityMs: 1_000, absoluteMs: 5_000 });
      if (!reason) return { ok: true, session };
      return { ok: false, reason };
    },
    onExpire: (result) => reasons.push(result.reason),
  });
  time.pass(1_000);
  controller.start();
  assert.deepEqual(reasons, ["inactive"]);
  controller.check();
  assert.deepEqual(reasons, ["inactive"]);
});

test("activity delays the idle lock and cannot delay the 60 minute lock", () => {
  const time = clock();
  const storage = memoryStorage();
  writeSession(storage, { verifiedAt: 0, lastActivityAt: 0 });
  const reasons = [];
  const controller = createSessionController({
    storage,
    now: time.now,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    inactivityMs: 1_000,
    absoluteMs: 5_000,
    enforce: () => {
      const session = readSession(storage);
      const reason = session
        ? expiryReason(session, time.now(), { inactivityMs: 1_000, absoluteMs: 5_000 })
        : "invalid";
      if (!reason) return { ok: true, session };
      return { ok: false, reason };
    },
    onExpire: (result) => reasons.push(result.reason),
  });
  controller.start();
  for (const stamp of [900, 1_800, 2_700, 3_600, 4_500]) {
    time.advance(900);
    assert.deepEqual(reasons, []);
    controller.noteActivity();
    assert.equal(time.now(), stamp);
  }
  assert.equal(readSession(storage).lastActivityAt, 0);
  time.advance(500);
  assert.deepEqual(reasons, ["absolute"]);
  assert.equal(readSession(storage).verifiedAt, 0);
  assert.equal(readSession(storage).lastActivityAt, 4_500);
});

test("hiding the page stores the latest activity and showing it locks an idle phone", () => {
  const time = clock();
  const storage = memoryStorage();
  writeSession(storage, { verifiedAt: 0, lastActivityAt: 0 });
  const reasons = [];
  const controller = createSessionController({
    storage,
    now: time.now,
    setTimeout: time.setTimeout,
    clearTimeout: time.clearTimeout,
    inactivityMs: 1_000,
    absoluteMs: 60_000,
    enforce: () => {
      const session = readSession(storage);
      const reason = expiryReason(session, time.now(), { inactivityMs: 1_000, absoluteMs: 60_000 });
      if (!reason) return { ok: true, session };
      return { ok: false, reason };
    },
    onExpire: (result) => reasons.push(result.reason),
  });
  controller.start();
  time.pass(200);
  controller.noteActivity();
  assert.equal(readSession(storage).lastActivityAt, 0);
  controller.persist();
  assert.equal(readSession(storage).lastActivityAt, 200);
  time.pass(1_000);
  controller.check();
  assert.deepEqual(reasons, ["inactive"]);
  assert.equal(readSession(storage).verifiedAt, 0);
});

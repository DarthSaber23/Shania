import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { TOPIC, browserStorage, createNotifier, messageFor, requestUrl } from "../js/notify.mjs";

const AT = new Date("2026-10-19T16:51:00.000Z");
const TIME = "19 Oct, 23:51 WIB";

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
  };
}

function harness(options = {}) {
  const calls = [];
  const beacons = [];
  let clockValue = options.clockStart ?? 1_000_000;
  const fetchImpl = options.fetchImpl || ((url, init) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true });
  });
  const notifier = createNotifier({
    fetchImpl,
    beacon: (url, body) => {
      beacons.push({ url, body });
      return true;
    },
    storage: Object.hasOwn(options, "storage") ? options.storage : memoryStorage(),
    now: () => options.at || AT,
    clock: () => clockValue,
  });
  return {
    calls,
    beacons,
    notifier,
    storage: options.storage,
    advance(ms) {
      clockValue += ms;
    },
  };
}

function posted(call) {
  const url = new URL(call.url);
  return {
    topic: `${url.origin}${url.pathname}`,
    title: url.searchParams.get("title"),
    priority: url.searchParams.get("priority"),
    tags: url.searchParams.get("tags"),
    body: call.init.body,
    method: call.init.method,
    mode: call.init.mode,
    keepalive: call.init.keepalive,
    headers: call.init.headers,
  };
}

test("messages include the WIB clock and the event copy", () => {
  assert.equal(messageFor("open", { at: AT }), `Shania opened the page 👀 · ${TIME}`);
  assert.equal(messageFor("no", { count: 2, limit: 5, at: AT }), `Shania tapped NO (2/5) · ${TIME}`);
  assert.equal(messageFor("sure", { at: AT }), `Shania reached Are you sure? · ${TIME}`);
  assert.equal(
    messageFor("sure-no", { at: AT }),
    `Shania tapped NO on Are you sure? (went back home) · ${TIME}`,
  );
  assert.equal(
    messageFor("yes", { count: 2, at: AT }),
    `Shania said YES! 💖 (after 2 NO taps) · ${TIME}`,
  );
});

test("the request is a simple POST with priority and tags in the query", () => {
  const open = new URL(requestUrl(TOPIC, "open"));
  assert.equal(`${open.origin}${open.pathname}`, "https://ntfy.sh/shania-radit-766350e890617d63");
  assert.equal(open.searchParams.get("priority"), "low");
  assert.equal(open.searchParams.get("title"), "Shania opened the page");
  assert.equal(open.searchParams.get("tags"), null);

  const no = new URL(requestUrl(TOPIC, "no"));
  assert.equal(no.searchParams.get("priority"), "low");

  const sure = new URL(requestUrl(TOPIC, "sure"));
  assert.equal(sure.searchParams.get("priority"), "default");
  assert.equal(sure.searchParams.get("title"), "Are you sure?");

  const home = new URL(requestUrl(TOPIC, "sure-no"));
  assert.equal(home.searchParams.get("priority"), "default");

  const yes = new URL(requestUrl(TOPIC, "yes"));
  assert.equal(yes.searchParams.get("priority"), "urgent");
  assert.equal(yes.searchParams.get("tags"), "heart,tada");
  assert.equal(yes.searchParams.get("title"), "Shania said YES!");
});

test("opening the question page notifies once per session", () => {
  const { notifier, calls } = harness();
  notifier.onAskLoad();
  notifier.onAskLoad();
  assert.equal(calls.length, 1);
  const post = posted(calls[0]);
  assert.equal(post.topic, TOPIC);
  assert.equal(post.priority, "low");
  assert.equal(post.body, `Shania opened the page 👀 · ${TIME}`);
  assert.equal(post.method, "POST");
  assert.equal(post.mode, "cors");
  assert.equal(post.keepalive, true);
  assert.equal(post.headers, undefined);
  assert.equal(typeof post.body, "string");
});

test("No taps publish the count and debounce a ghost double click", () => {
  const box = harness();
  assert.equal(box.notifier.onNoTap(1, 5), true);
  box.advance(100);
  assert.equal(box.notifier.onNoTap(2, 5), false);
  box.advance(400);
  assert.equal(box.notifier.onNoTap(3, 5), true);
  assert.equal(box.calls.length, 2);
  assert.equal(posted(box.calls[0]).body, `Shania tapped NO (1/5) · ${TIME}`);
  assert.equal(posted(box.calls[0]).priority, "low");
  assert.equal(posted(box.calls[1]).body, `Shania tapped NO (3/5) · ${TIME}`);
});

test("a debounced tap still counts toward the Yes total", () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  box.notifier.onNoTap(1, 5);
  box.advance(50);
  box.notifier.onNoTap(2, 5);
  box.notifier.armYes();
  box.calls.length = 0;
  assert.equal(box.notifier.onYeayyLoad(), true);
  assert.equal(posted(box.calls[0]).body, `Shania said YES! 💖 (after 2 NO taps) · ${TIME}`);
  assert.equal(posted(box.calls[0]).priority, "urgent");
  assert.equal(posted(box.calls[0]).tags, "heart,tada");
});

test("reaching Are you sure notifies at default priority", () => {
  const { notifier, calls } = harness();
  notifier.onSureLoad();
  assert.equal(calls.length, 1);
  assert.equal(posted(calls[0]).priority, "default");
  assert.equal(posted(calls[0]).body, `Shania reached Are you sure? · ${TIME}`);
});

test("No on Are you sure is delivered once when the question page loads", () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  box.notifier.onAskLoad();
  box.calls.length = 0;
  box.notifier.onAskLoad();
  assert.equal(box.calls.length, 0);
  box.notifier.armSureReturn();
  box.notifier.onAskLoad();
  box.notifier.onAskLoad();
  assert.equal(box.calls.length, 1);
  assert.equal(
    posted(box.calls[0]).body,
    `Shania tapped NO on Are you sure? (went back home) · ${TIME}`,
  );
  assert.equal(posted(box.calls[0]).priority, "default");
});

test("coming home resets the stored No count", () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  box.notifier.onAskLoad();
  box.notifier.onNoTap(4, 5);
  box.notifier.armSureReturn();
  box.notifier.onAskLoad();
  box.notifier.armYes();
  box.calls.length = 0;
  box.notifier.onYeayyLoad();
  assert.equal(posted(box.calls[0]).body, `Shania said YES! 💖 (after 0 NO taps) · ${TIME}`);
});

test("Yes notifies once for that click and again for a later Yes", () => {
  const storage = memoryStorage();
  const box = harness({ storage });
  box.notifier.onNoTap(2, 5);
  box.notifier.armYes();
  assert.equal(box.notifier.onYeayyLoad(), true);
  assert.equal(box.notifier.onYeayyLoad(), false);
  box.advance(1);
  box.notifier.armYes();
  assert.equal(box.notifier.onYeayyLoad(), true);
  const yesCalls = box.calls.filter((call) => posted(call).priority === "urgent");
  assert.equal(yesCalls.length, 2);
});

test("opening Yeayy directly does not notify", () => {
  const { notifier, calls } = harness();
  assert.equal(notifier.onYeayyLoad(), false);
  assert.equal(calls.length, 0);
});

test("a rejected fetch does not throw", async () => {
  const { notifier } = harness({
    fetchImpl: () => Promise.reject(new Error("offline")),
  });
  assert.doesNotThrow(() => notifier.onSureLoad());
  await new Promise((resolve) => setImmediate(resolve));
});

test("a missing fetch uses sendBeacon", () => {
  const beacons = [];
  const notifier = createNotifier({
    beacon: (url, body) => {
      beacons.push({ url, body });
      return true;
    },
    storage: memoryStorage(),
    now: () => AT,
  });
  notifier.onSureLoad();
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].body, `Shania reached Are you sure? · ${TIME}`);
});

test("blocked sessionStorage still publishes events that do not need to cross a page", () => {
  const global = {
    sessionStorage: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
  };
  assert.equal(browserStorage(global), undefined);
  const box = harness({ storage: undefined });
  box.notifier.onAskLoad();
  box.notifier.onNoTap(1, 5);
  box.notifier.onSureLoad();
  assert.deepEqual(
    box.calls.map((call) => posted(call).body),
    [
      `Shania opened the page 👀 · ${TIME}`,
      `Shania tapped NO (1/5) · ${TIME}`,
      `Shania reached Are you sure? · ${TIME}`,
    ],
  );
});

test("a throwing fetch falls back to sendBeacon and stays quiet", () => {
  const box = harness({
    fetchImpl: () => {
      throw new Error("missing");
    },
  });
  assert.doesNotThrow(() => box.notifier.onSureLoad());
  assert.equal(box.beacons.length, 1);
  assert.equal(box.beacons[0].body, `Shania reached Are you sure? · ${TIME}`);
  assert.match(box.beacons[0].url, /^https:\/\/ntfy\.sh\/shania-radit-766350e890617d63\?/);
});

test("broken storage does not break the page hooks", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  const box = harness({ storage });
  assert.doesNotThrow(() => {
    box.notifier.onAskLoad();
    box.notifier.onNoTap(1, 5);
    box.notifier.armSureReturn();
    box.notifier.armYes();
    box.notifier.onYeayyLoad();
    box.notifier.onSureLoad();
  });
  assert.ok(box.calls.length >= 1);
});

test("the pages keep their visible copy and the app reports every event", () => {
  const app = fs.readFileSync("js/app.mjs", "utf8");
  assert.match(app, /createNotifier/);
  assert.match(app, /onAskLoad\(/);
  assert.match(app, /onNoTap\(/);
  assert.match(app, /onSureLoad\(/);
  assert.match(app, /armSureReturn\(/);
  assert.match(app, /armYes\(/);
  assert.match(app, /onYeayyLoad\(/);
  for (const file of ["index.html", "sure.html", "yeayy.html"]) {
    const html = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(html, /ntfy|notification/i);
  }
});

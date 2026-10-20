# Phone Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell Radit, on his phone via ntfy, when Shania opens the question, taps No, reaches "Are you sure?", goes back home, or says Yes.

**Architecture:** `js/notify.mjs` owns message text, query-string priority, session flags, and a silent `fetch`. `js/app.mjs` reports six page events and does not wait on the network. Yes is armed on click and published when `yeayy.html` loads so the navigation cannot drop it.

**Tech Stack:** Static HTML and ES modules. Tests run with `node --test`. No build step and no `package.json`.

## Global Constraints

- GitHub Pages serves the repository root. No build step. Do not add `package.json`.
- POST plain text to `https://ntfy.sh/shania-radit-766350e890617d63`.
- `fetch(url, { method: "POST", body: text, mode: "cors", keepalive: true })`. No custom headers. `title`, `priority`, and `tags` are query params.
- Priorities: open and No are `low`, sure arrival and sure-page No are `default`, Yes is `urgent` with `tags=heart,tada`.
- Include Asia/Jakarta local time, formatted like `19 Oct, 23:51 WIB`.
- Page open once per tab session. No taps debounced 400ms (leading edge) so ghosts do not spam; the stored count still updates. Yes once per Yes click, not again on Yeayy reload. Sure-page No delivered on the next question-page load. Question page resets the stored No count on load.
- Never block or break navigation, the dodge, confetti, or YouTube-less copy. No visible UI. Fail silently offline.
- Keep: No dodges 5 times then `sure.html`, Yes dodges there, No returns home with the counter reset.

---

### Task 1: Failing notifier tests

**Files:**
- Create: `test/notify.test.mjs`

**Interfaces:**
- Consumes: nothing
- Produces: the contract `createNotifier`, `messageFor`, `requestUrl`, and `TOPIC` must satisfy

- [x] **Step 1: Write the failing test**

Cover copy, WIB, query priority and tags, fetch shape, once-only open, debounce, sure-no only after arming, count reset, Yes once per token, direct Yeayy silence, rejected fetch, beacon fallback, and throwing storage.

- [x] **Step 2: Run test to verify it fails**

Run: `node --test test/notify.test.mjs`
Expected: FAIL because `../js/notify.mjs` does not exist

### Task 2: Notifier module

**Files:**
- Create: `js/notify.mjs`
- Test: `test/notify.test.mjs`

**Interfaces:**
- Consumes: Task 1 contract
- Produces: `createNotifier({ fetchImpl, beacon, storage, now, clock })` with `onAskLoad`, `onNoTap(count, limit)`, `onSureLoad`, `armSureReturn`, `armYes`, `onYeayyLoad`

- [x] **Step 3: Write minimal implementation**

- [x] **Step 4: Run test to verify it passes**

Run: `node --test test/notify.test.mjs`
Expected: PASS

### Task 3: Wire the three pages

**Files:**
- Modify: `js/app.mjs`
- Modify: `test/notify.test.mjs`

**Interfaces:**
- Consumes: `createNotifier` from `js/notify.mjs`
- Produces: question page calls `onAskLoad`, `onNoTap`, and `armYes`; sure page calls `onSureLoad` and `armSureReturn`; Yeayy calls `onYeayyLoad`

- [x] **Step 5: Assert the wiring, watch it fail, then call the hooks from `app.mjs` without changing dodge behavior**

- [x] **Step 6: Run the whole suite**

Run: `node --test`
Expected: PASS

- [x] **Step 7: Commit**

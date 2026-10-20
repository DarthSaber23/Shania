# Session timeout implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End a verified session after 15 idle minutes or 60 minutes from verification, and show the gate again on the same page.

**Architecture:** `js/session.mjs` owns the durations, the session record, the claim, and the timers. `js/gate.mjs` writes the record on a correct code, enforces it, and reopens the gate. The three HTML files hide an expired session before paint. `js/app.mjs` stops the YouTube player on lock.

**Tech Stack:** Static HTML, CSS, and ES modules. `node --test`. No build step and no `package.json`.

## Global Constraints

- No `package.json` and no build step.
- Topic stays `https://ntfy.sh/shania-radit-766350e890617d63`.
- `INACTIVITY_MS` is `15 * 60 * 1000`. `ABSOLUTE_MS` is `60 * 60 * 1000`.
- Gate sentence is exactly `Sesi kamu habis, minta kode baru ya 😊`.
- User-facing copy says Fajar, never Radit.
- Expiry does not reload the page.
- One ntfy post per verification, including a second tab or a reload.
- A query value may shorten a duration and must not lengthen it.
- Existing code, cooldown, and page notifications stay as they are.

---

### Task 1: Session clock

**Files:**
- Create: `js/session.mjs`
- Test: `test/session.test.mjs`

**Interfaces:**
- Produces: `INACTIVITY_MS`, `ABSOLUTE_MS`, `ACTIVITY_PERSIST_MS`, `ACTIVITY_EVENTS`, `SESSION_KEY`, `EXPIRY_NOTICE_KEY`, `EXPIRY_TITLE`
- Produces: `readSession(storage)`, `writeSession(storage, session)`, `expiryReason(session, now, durations)`, `expiryBody(reason, at, durations)`, `claimExpiryNotice(storage, token)`, `hasExpiryNotice(storage)`, `resolveDurations(search, durations)`, `createSessionController(options)`

- [ ] **Step 1: Write the failing test**

Cover exact 15-minute and 60-minute boundaries, activity that moves only `lastActivityAt`, absolute timeout while activity continues, the earlier reason when both have passed, a claim that returns true once, and a controller that expires on a fake clock without treating `visibilitychange` as activity.

- [ ] **Step 2: Run `node --test test/session.test.mjs`**

Expected: FAIL because `js/session.mjs` is missing.

- [ ] **Step 3: Implement `js/session.mjs`**

- [ ] **Step 4: Run `node --test test/session.test.mjs`**

Expected: PASS

### Task 2: Gate enforcement

**Files:**
- Modify: `js/gate.mjs`
- Modify: `index.html`, `sure.html`, `yeayy.html`
- Modify: `css/styles.css`
- Modify: `js/player.mjs`, `js/app.mjs`
- Test: `test/gate.test.mjs`, `test/player.test.mjs`

**Interfaces:**
- Consumes: Task 1 exports
- Produces: `createGate(...).enforce()` returning `{ ok, reason, notified }`
- Produces: `COPY.expired`
- Produces: `stopYouTube({ player, postMessage, origin })`
- `mountGate` accepts `onLock` and reopens `[data-verify-gate]` without a reload

- [ ] **Step 1: Write failing gate and player tests**

A correct code stores the session. A stale session is not verified. `enforce` posts once and a second call does not. `mountGate` shows the expiry sentence and calls `onLock`. `stopYouTube` pauses, stops, and posts the iframe command.

- [ ] **Step 2: Run `node --test test/gate.test.mjs test/player.test.mjs`**

Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement the gate, the three pages, the player stop, and `onLock`**

- [ ] **Step 4: Run `node --test`**

Expected: PASS

### Task 3: Phone check

- [ ] **Step 1: Serve the site and open `index.html?inactivityMs=1500&absoluteMs=60000` at 390×844 with ntfy intercepted.**
- [ ] **Step 2: Seed a fresh verified session, wait for the idle lock, and screenshot the gate with `Sesi kamu habis, minta kode baru ya 😊`.**
- [ ] **Step 3: Open `yeayy.html` with the same short idle timer and confirm the player stop runs when the gate returns.**

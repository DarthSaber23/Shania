# Verification gate implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a phone-friendly verification gate on every page until the newest ntfy code is entered.

**Architecture:** `js/gate.mjs` owns code generation, `localStorage`, the cooldown, and the ntfy posts. Each HTML file has the same gate card plus a blocking head script that hides the page before paint. `js/app.mjs` calls `mountGate` and runs the existing dodge, confetti, video, and notifier only from `onUnlock`.

**Tech Stack:** Static HTML, CSS, and ES modules. `node --test`. No build step and no `package.json`.

## Global Constraints

- No `package.json` and no build step.
- Topic stays `https://ntfy.sh/shania-radit-766350e890617d63`.
- Code is 8 characters from `crypto.getRandomValues`, alphabet `A-Z a-z 0-9`.
- Code post title is `Kode verifikasi Shania` and priority is `high`.
- WhatsApp note text is exactly `Kode belum masuk? Chat Fajar di WhatsApp ya 😊`.
- `WA_NUMBER` defaults to `""`. User-facing copy says Fajar, never Radit.
- Cooldown is 60 seconds. Pending code and cooldown survive refresh. Only the newest successful code matches.
- Existing page-open notification runs after unlock, not when the gate appears.
- ntfy failure shows a message that suggests WhatsApp.

---

### Task 1: Gate module

**Files:**
- Create: `js/gate.mjs`
- Test: `test/gate.test.mjs`

**Interfaces:**
- Produces: `createGate({ fetchImpl, storage, now, date, randomCode, waNumber, topic })` with `sendCode()`, `check(value)`, `pending()`, `isVerified()`
- Produces: `randomCode(getRandomValues)`, `codeFromBytes(bytes)`, `COPY`, `WA_NUMBER`, `COOLDOWN_MS`, `mountGate({ onUnlock, storage, fetchImpl, waNumber })`

- [ ] **Step 1:** Write `test/gate.test.mjs` and run `node --test test/gate.test.mjs`. Expected: fail because `js/gate.mjs` is missing.
- [ ] **Step 2:** Implement `js/gate.mjs` until `node --test test/gate.test.mjs` passes.

### Task 2: Pages

**Files:**
- Modify: `index.html`, `sure.html`, `yeayy.html`, `css/styles.css`, `js/app.mjs`

- [ ] **Step 1:** Add the shared gate card and head script. Hide `#page-main` and `.burst` while `html.is-gated`.
- [ ] **Step 2:** Move dodge, confetti, video, and `bootNotifier(notifier)` into `bootExperience`, passed as `onUnlock: bootExperience`.
- [ ] **Step 3:** Run `node --test`. Expected: all tests pass.

### Task 3: Phone check

- [ ] **Step 1:** Open the site at 390×844 with ntfy intercepted. Capture the gate, the countdown, the wrong-code error, and the unlocked question.
- [ ] **Step 2:** Confirm `sure.html` and `yeayy.html` show the same gate when unverified.

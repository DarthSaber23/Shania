# For Shania Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo with a romantic, mobile-first static ask page that dodges No, celebrates Yes, and still deploys from the repository root.

**Architecture:** Three HTML documents share `css/styles.css`, `js/dodge.mjs` (pure placement and the No counter), `js/celebrate.mjs` (pure confetti specs), and `js/app.mjs` (DOM). Relative URLs only.

**Tech Stack:** Static HTML, CSS, and ES modules. Tests run with `node --test`. No package.json and no build step.

## Global Constraints

- Deployed by the existing `.github/workflows/static.yml`; no build step.
- Keep `.nojekyll`, `manifest.webmanifest`, and the PNG icons working; romantic name and colors.
- Question copy includes "Shania, would you be my girlfriend?"; celebration heading is "Yeayy!".
- No jumps on pointerdown/Enter/Space, never on hover; fifth No opens the sure page; sure Yes dodges forever; sure No returns home and the counter is 0.
- Fleeing control stays fully on screen, at least 16px clear of the question, and works with touch.
- Safe-area insets, 56px controls, no horizontal scroll, `prefers-reduced-motion` respected.
- Target phones 375×812 and 360×800, and remain fine on desktop.
- Do not add `package.json`.

---

### Task 1: Placement and counter

**Files:** `js/dodge.mjs`, `test/dodge.test.mjs`

- [ ] Write failing tests for the fifth-press counter, full visibility, 16px clearance, safe-area origin, a one-row gap, and 20 repeated phone-sized jumps.
- [ ] Run `node --test test/dodge.test.mjs` and confirm the failure is the missing module.
- [ ] Implement `nextRefusal`, `rectsOverlap`, and `placeDodger`.
- [ ] Re-run the tests and confirm they pass.

### Task 2: Confetti specs

**Files:** `js/celebrate.mjs`, `test/celebrate.test.mjs`

- [ ] Write a failing test that confetti pieces stay within the viewport percentages and a modest drift.
- [ ] Implement `buildConfetti` and confirm the test passes.

### Task 3: Pages, style, manifest, icons

**Files:** `index.html`, `sure.html`, `yeayy.html`, `css/styles.css`, `js/app.mjs`, `manifest.webmanifest`, icons, `.nojekyll`, `test/site.test.mjs`

- [ ] Write failing file-level tests for copy, links, dodge hooks, manifest colors, safe-area CSS, reduced motion, and the absence of hover-triggered moves.
- [ ] Implement the three pages, styles, DOM behavior, icons, and manifest.
- [ ] Run `node --test` and confirm every test passes.

### Task 4: Review and phone verification

- [ ] Review the diff for correctness, mobile UX, accessibility, and edge cases. Fix findings.
- [ ] Serve the site and walk the Yes path, the five-No path, the dodging Yes, and the return home at 375×812 and 360×800.
- [ ] Re-run `node --test` after fixes.

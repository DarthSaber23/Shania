# No Button Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the question page, each No tap that still dodges changes the button label and its accessible name, and the dodge places that new width.

**Architecture:** Pure label and size helpers live in `js/dodge.mjs`. `js/app.mjs` applies the label only for `data-dodge="count"` after a tap that does not navigate, then clears the old width lock and places with the measured box. The sure page does not use the label table.

**Tech Stack:** Static HTML, CSS, and ES modules. `node --test`. No build step and no new dependencies.

## Global Constraints

- Labels, in order: start `No`; after tap 1 `Are you sure?`; after tap 2 `Think again 🥺`; after tap 3 `Pleaseee 😭`; after tap 4 `Last chance 💔`.
- The 5th tap still opens `sure.html` and does not apply another label.
- Keep labels on one line so they fit a 360px-wide phone. Minimum target stays 48px. Re-measure after the label change, once the button is out of the grid, before placing.
- Reset the label to `No` when returning home resets the counter (`index.html` initial text and `aria-label`).
- Update `aria-label` to the same string as the visible label.
- Do not change the ntfy notifier, the Yeayy YouTube player, the full-name rows, confetti, or the sure-page flow. Tests must mock fetch and must not send real ntfy messages.
- No `package.json`. No build. Repo root stays the GitHub Pages site.

---

### Task 1: Refusal label sequence

**Files:**
- Modify: `js/dodge.mjs`
- Test: `test/dodge.test.mjs`

**Interfaces:**
- Consumes: `nextRefusal(count, limit = 5)` → `{ count: number, openSure: boolean }`
- Produces: `refusalLabel(count: number) → string`
- Produces: `refusalAfterTap(count: number, limit = 5) → { count: number, openSure: boolean, label: string | null }`

- [ ] **Step 1: Write the failing test**

Add this test at the end of `test/dodge.test.mjs` and import `refusalAfterTap` and `refusalLabel` from `../js/dodge.mjs`.

```javascript
test("No changes label on taps 1-4 and the fifth tap still opens sure", () => {
  assert.equal(refusalLabel(0), "No");
  const expected = [
    "Are you sure?",
    "Think again 🥺",
    "Pleaseee 😭",
    "Last chance 💔",
  ];
  let count = 0;
  for (const label of expected) {
    const step = refusalAfterTap(count, 5);
    count = step.count;
    assert.equal(step.openSure, false);
    assert.equal(step.label, label);
    assert.equal(refusalLabel(count), label);
  }
  assert.deepEqual(refusalAfterTap(count, 5), { count: 5, openSure: true, label: null });
  assert.equal(refusalLabel(0), "No");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dodge.test.mjs`

Expected: FAIL because `refusalLabel` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/dodge.mjs` after `nextRefusal`:

```javascript
export const REFUSAL_LABELS = [
  "No",
  "Are you sure?",
  "Think again 🥺",
  "Pleaseee 😭",
  "Last chance 💔",
];

export function refusalLabel(count) {
  const index = Number.isFinite(count) ? Math.trunc(count) : 0;
  if (index <= 0) return REFUSAL_LABELS[0];
  if (index >= REFUSAL_LABELS.length - 1) return REFUSAL_LABELS[REFUSAL_LABELS.length - 1];
  return REFUSAL_LABELS[index];
}

export function refusalAfterTap(count, limit = 5) {
  const step = nextRefusal(count, limit);
  if (step.openSure) return { count: step.count, openSure: true, label: null };
  return { count: step.count, openSure: false, label: refusalLabel(step.count) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dodge.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/dodge.mjs test/dodge.test.mjs
git commit -m "Change the No label on each dodge before the sure page."
```

### Task 2: Measured size for the phone lane

**Files:**
- Modify: `js/dodge.mjs`
- Test: `test/dodge.test.mjs`

**Interfaces:**
- Consumes: viewport `bounds` `{ left, top, right, bottom }` and a measured content box
- Produces: `placementSize({ contentWidth, contentHeight, bounds, minTarget = 48 }) → { width: number, height: number }`

- [ ] **Step 1: Write the failing test**

Import `placementSize` and add:

```javascript
test("placement keeps the new label width inside a 360px lane and at least 48px", () => {
  const bounds = { left: 8, top: 8, right: 352, bottom: 792 };
  assert.deepEqual(
    placementSize({ contentWidth: 186, contentHeight: 56, bounds }),
    { width: 186, height: 56 },
  );
  assert.deepEqual(
    placementSize({ contentWidth: 420, contentHeight: 30, bounds }),
    { width: 344, height: 48 },
  );
  assert.deepEqual(
    placementSize({ contentWidth: 20, contentHeight: 20, bounds }),
    { width: 48, height: 48 },
  );
  const lane = placementSize({ contentWidth: 186, contentHeight: 56, bounds });
  const obstacles = [{ x: 16, y: 220, width: 328, height: 360 }];
  const pos = placeDodger({
    width: lane.width,
    height: lane.height,
    bounds,
    obstacles,
    gap: 16,
    random: () => 0.5,
    minTravel: 0,
  });
  assertInside(pos, lane.width, lane.height, bounds);
  assertClear(pos, lane.width, lane.height, obstacles, 16);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/dodge.test.mjs`

Expected: FAIL because `placementSize` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `js/dodge.mjs`:

```javascript
export function placementSize({ contentWidth, contentHeight, bounds, minTarget = 48 }) {
  if (!(contentWidth > 0) || !(contentHeight > 0)) {
    throw new Error("The fleeing button needs a positive size.");
  }
  const laneW = bounds.right - bounds.left;
  const laneH = bounds.bottom - bounds.top;
  if (!(laneW > 0) || !(laneH > 0)) {
    throw new Error("The viewport bounds are empty.");
  }
  let width = Math.min(contentWidth, laneW);
  let height = Math.min(contentHeight, laneH);
  if (width < minTarget) width = Math.min(minTarget, laneW);
  if (height < minTarget) height = Math.min(minTarget, laneH);
  return { width, height };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/dodge.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/dodge.mjs test/dodge.test.mjs
git commit -m "Size the fleeing No button from its measured label."
```

### Task 3: Apply the label, then re-measure, on the question page

**Files:**
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.mjs`
- Modify: `README.md`
- Test: `test/site.test.mjs`

**Interfaces:**
- Consumes: `refusalAfterTap` and `placementSize` from Task 1 and Task 2
- Produces: question-page No button whose text and `aria-label` follow the tap, placed from the unlocked measurement

- [ ] **Step 1: Write the failing test**

Add to `test/site.test.mjs`:

```javascript
test("the question No button changes its name before the dodge measures it", () => {
  const index = read("index.html");
  const css = read("css/styles.css");
  const app = read("js/app.mjs");
  assert.match(index, /<button class="btn no" type="button" aria-label="No" data-dodge="count" data-limit="5" data-next="sure\.html">No<\/button>/);
  assert.match(css, /\.btn\.no[^{]*\{[^}]*white-space:\s*nowrap/);
  const press = app.slice(app.indexOf("const press = () =>"), app.indexOf("button.addEventListener"));
  const openAt = press.indexOf("result.openSure");
  const labelAt = press.indexOf("button.textContent = result.label");
  const nameAt = press.indexOf('button.setAttribute("aria-label", result.label)');
  const jumpAt = press.indexOf("jump(button)");
  assert.ok(openAt > -1 && labelAt > openAt && nameAt > labelAt && jumpAt > nameAt);
  assert.match(press, /refusalAfterTap\(count, limit\)/);
  const measure = app.slice(app.indexOf("function readLabelSize"), app.indexOf("function jump"));
  const unlockAt = measure.indexOf('width = "max-content"');
  const readAt = measure.indexOf("readLabelSize(button)");
  const sizeAt = measure.indexOf("placementSize(");
  const dodgeAt = measure.indexOf("placeDodger(");
  assert.ok(unlockAt > -1 && readAt > unlockAt && sizeAt > readAt && dodgeAt > sizeAt);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/site.test.mjs`

Expected: FAIL because the button has no `aria-label` and `app.mjs` does not call `refusalAfterTap`.

- [ ] **Step 3: Write minimal implementation**

In `index.html`, replace the No button with:

```html
<button class="btn no" type="button" aria-label="No" data-dodge="count" data-limit="5" data-next="sure.html">No</button>
```

In `css/styles.css`, the No rule becomes:

```css
.btn.no,
.btn.no:visited {
  background: var(--no-bg);
  color: var(--no-ink);
  border-color: var(--line);
  white-space: nowrap;
}
```

In `js/app.mjs`, change the dodge import to:

```javascript
import { placeDodger, placementSize, rectsOverlap, refusalAfterTap } from "./dodge.mjs";
```

Replace `placeClear` with a copy that measures after clearing the width lock. Leave `jump`, `detach`, and the rest of the function body as they are. The top of `placeClear` is:

```javascript
function readLabelSize(button) {
  button.style.whiteSpace = "nowrap";
  button.style.maxWidth = "none";
  button.style.width = "max-content";
  button.style.height = "auto";
  const style = getComputedStyle(button);
  const borderX = (Number.parseFloat(style.borderLeftWidth) || 0)
    + (Number.parseFloat(style.borderRightWidth) || 0);
  const borderY = (Number.parseFloat(style.borderTopWidth) || 0)
    + (Number.parseFloat(style.borderBottomWidth) || 0);
  let contentWidth = button.offsetWidth;
  let contentHeight = button.offsetHeight;
  if (button.scrollWidth > button.offsetWidth + 1) contentWidth = button.scrollWidth + borderX;
  if (button.scrollHeight > button.offsetHeight + 1) contentHeight = button.scrollHeight + borderY;
  return { contentWidth, contentHeight };
}

function placeClear(button, previous, minTravel) {
  const bounds = viewportBounds();
  const obstacles = obstacleRects(button);
  const measured = readLabelSize(button);
  const fitted = placementSize({
    contentWidth: measured.contentWidth,
    contentHeight: measured.contentHeight,
    bounds,
  });
  const width = fitted.width;
  const height = fitted.height;
  const options = [
    { width, height, gap: GAP },
    { width: Math.min(width, 112), height, gap: GAP },
    { width: Math.min(width, 96), height: Math.min(height, 48), gap: 8 },
  ];
```

`jump` stays:

```javascript
function jump(button) {
  const before = button.getBoundingClientRect();
  detach(button);
  placeClear(button, { x: before.left, y: before.top }, MIN_TRAVEL);
}
```

`detach` runs first, so the button is `position: fixed` before `readLabelSize`. In `press`, replace the `nextRefusal` block with:

```javascript
const result = refusalAfterTap(count, limit);
count = result.count;
try {
  notifier?.onNoTap(count, limit);
} catch {
  // A failed notification must not stop the dodge or the navigation.
}
if (result.openSure) {
  leaving = true;
  window.location.assign(nextUrl);
  return;
}
button.textContent = result.label;
button.setAttribute("aria-label", result.label);
```

In `README.md`, replace the sentence that starts with `` `index.html` asks the question. `` with:

```markdown
`index.html` asks the question. Yes opens `yeayy.html`. No jumps away on tap, and its label goes from No to Are you sure?, Think again, Pleaseee, and Last chance. The fifth press opens `sure.html`, where Yes is the button that keeps moving and No returns to the question, which loads again with the counter at zero and the label No.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`

Expected: PASS, including the notifier, player, celebration, and site tests. No test calls the network.

- [ ] **Step 5: Commit**

```bash
git add index.html css/styles.css js/app.mjs README.md test/site.test.mjs
git commit -m "Show the next No label before the button dodges."
```

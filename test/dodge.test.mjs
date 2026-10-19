import assert from "node:assert/strict";
import test from "node:test";
import { nextRefusal, placeDodger, rectsOverlap } from "../js/dodge.mjs";

function rect(pos, width, height) {
  return { x: pos.x, y: pos.y, width, height };
}

function assertInside(pos, width, height, bounds) {
  assert.ok(pos.x >= bounds.left - 0.001, `left ${pos.x} < ${bounds.left}`);
  assert.ok(pos.y >= bounds.top - 0.001, `top ${pos.y} < ${bounds.top}`);
  assert.ok(pos.x + width <= bounds.right + 0.001, `right ${pos.x + width} > ${bounds.right}`);
  assert.ok(pos.y + height <= bounds.bottom + 0.001, `bottom ${pos.y + height} > ${bounds.bottom}`);
}

function assertClear(pos, width, height, obstacles, gap) {
  const mover = rect(pos, width, height);
  for (const obstacle of obstacles) {
    assert.equal(
      rectsOverlap(mover, obstacle, gap),
      false,
      `overlapped ${JSON.stringify(obstacle)} at ${JSON.stringify(pos)}`,
    );
  }
}

test("the fifth No opens the sure page and earlier presses do not", () => {
  let count = 0;
  for (let press = 1; press <= 4; press += 1) {
    const result = nextRefusal(count, 5);
    count = result.count;
    assert.equal(count, press);
    assert.equal(result.openSure, false);
  }
  const fifth = nextRefusal(count, 5);
  assert.deepEqual(fifth, { count: 5, openSure: true });
});

test("a fresh question starts the counter at zero", () => {
  assert.equal(nextRefusal(0, 5).openSure, false);
  assert.equal(nextRefusal(0, 5).count, 1);
});

test("rectsOverlap treats the gap as required clearance", () => {
  const mover = { x: 0, y: 0, width: 100, height: 50 };
  const beside = { x: 116, y: 0, width: 40, height: 50 };
  const tooClose = { x: 115, y: 0, width: 40, height: 50 };
  assert.equal(rectsOverlap(mover, beside, 16), false);
  assert.equal(rectsOverlap(mover, tooClose, 16), true);
  assert.equal(rectsOverlap(mover, { x: 100, y: 0, width: 10, height: 10 }, 0), false);
});

test("placement stays fully visible and clear of the stationary control", () => {
  const bounds = { left: 8, top: 12, right: 367, bottom: 800 };
  const width = 150;
  const height = 64;
  const obstacles = [{ x: 90, y: 360, width: 160, height: 64 }];
  const pos = placeDodger({
    width,
    height,
    bounds,
    obstacles,
    gap: 16,
    random: () => 0.2,
    minTravel: 0,
  });
  assertInside(pos, width, height, bounds);
  assertClear(pos, width, height, obstacles, 16);
});

test("a safe-area origin is not treated as off-screen space", () => {
  const bounds = { left: 47, top: 36, right: 360, bottom: 780 };
  const pos = placeDodger({
    width: 140,
    height: 56,
    bounds,
    obstacles: [{ x: 80, y: 300, width: 200, height: 80 }],
    gap: 16,
    random: () => 0,
    minTravel: 0,
  });
  assert.ok(pos.x >= 47);
  assert.ok(pos.y >= 36);
  assertInside(pos, 140, 56, bounds);
});

test("a centered random still finds the thin band above a full-width card", () => {
  const bounds = { left: 0, top: 0, right: 360, bottom: 700 };
  const obstacles = [{ x: 0, y: 72, width: 360, height: 628 }];
  const pos = placeDodger({
    width: 120,
    height: 56,
    bounds,
    obstacles,
    gap: 16,
    random: () => 0.5,
    minTravel: 0,
  });
  assert.ok(Math.abs(pos.y) < 0.001);
  assertInside(pos, 120, 56, bounds);
  assertClear(pos, 120, 56, obstacles, 16);
});

test("twenty jumps on a phone stay visible and clear of the question", () => {
  const bounds = { left: 16, top: 20, right: 359, bottom: 792 };
  const width = 156;
  const height = 56;
  const obstacles = [{ x: 32, y: 250, width: 311, height: 280 }];
  let previous = null;
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 20; i += 1) {
    const pos = placeDodger({
      width,
      height,
      bounds,
      obstacles,
      gap: 16,
      random,
      previous,
      minTravel: 96,
    });
    assertInside(pos, width, height, bounds);
    assertClear(pos, width, height, obstacles, 16);
    if (previous) {
      const dx = pos.x - previous.x;
      const dy = pos.y - previous.y;
      assert.ok(dx * dx + dy * dy > 1, "button did not move");
    }
    previous = pos;
  }
});

test("an oversized control is pinned to the safe origin instead of looping", () => {
  const pos = placeDodger({
    width: 500,
    height: 80,
    bounds: { left: 10, top: 12, right: 300, bottom: 400 },
    obstacles: [],
    random: () => 0.3,
  });
  assert.deepEqual(pos, { x: 10, y: 12 });
});

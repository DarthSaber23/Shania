import assert from "node:assert/strict";
import test from "node:test";
import { buildConfetti } from "../js/celebrate.mjs";

test("confetti stays inside the viewport width and drifts only a little", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pieces = buildConfetti(40, random);
  assert.equal(pieces.length, 40);
  for (const piece of pieces) {
    assert.ok(piece.left >= 0 && piece.left <= 100);
    assert.ok(piece.drift >= -40 && piece.drift <= 40);
    assert.ok(piece.duration >= 2.2 && piece.duration <= 4.2);
    assert.ok(piece.size >= 8 && piece.size <= 18);
    assert.equal(typeof piece.heart, "boolean");
    assert.match(piece.color, /^#[0-9a-f]{6}$/);
  }
});

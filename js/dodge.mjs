export function nextRefusal(count, limit = 5) {
  const next = count + 1;
  return { count: next, openSure: next >= limit };
}

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

export function rectsOverlap(a, b, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function fits(x, y, width, height, bounds) {
  return (
    x >= bounds.left &&
    y >= bounds.top &&
    x + width <= bounds.right &&
    y + height <= bounds.bottom
  );
}

export function placeDodger({
  width,
  height,
  bounds,
  obstacles = [],
  gap = 16,
  random = Math.random,
  previous = null,
  minTravel = 96,
  attempts = 48,
}) {
  if (!(width > 0) || !(height > 0)) {
    throw new Error("The fleeing button needs a positive size.");
  }
  const spanX = bounds.right - bounds.left;
  const spanY = bounds.bottom - bounds.top;
  if (!(spanX > 0) || !(spanY > 0)) {
    throw new Error("The viewport bounds are empty.");
  }
  if (width > spanX || height > spanY) {
    return { x: bounds.left, y: bounds.top };
  }

  const maxX = bounds.right - width;
  const maxY = bounds.bottom - height;
  const clearOf = (x, y) => {
    const mover = { x, y, width, height };
    return obstacles.every((obstacle) => !rectsOverlap(mover, obstacle, gap));
  };
  const traveled = (x, y) => {
    if (!previous || !(minTravel > 0)) return true;
    const dx = x - previous.x;
    const dy = y - previous.y;
    return dx * dx + dy * dy >= minTravel * minTravel;
  };

  for (let i = 0; i < attempts; i += 1) {
    const x = bounds.left + random() * (maxX - bounds.left);
    const y = bounds.top + random() * (maxY - bounds.top);
    if (fits(x, y, width, height, bounds) && clearOf(x, y) && traveled(x, y)) {
      return { x, y };
    }
  }

  const candidates = [];
  const push = (x, y) => {
    if (x < bounds.left || y < bounds.top || x > maxX || y > maxY) return;
    candidates.push({ x, y });
  };

  push(bounds.left, bounds.top);
  push(maxX, bounds.top);
  push(bounds.left, maxY);
  push(maxX, maxY);
  push((bounds.left + maxX) / 2, bounds.top);
  push((bounds.left + maxX) / 2, maxY);
  push(bounds.left, (bounds.top + maxY) / 2);
  push(maxX, (bounds.top + maxY) / 2);

  for (const obstacle of obstacles) {
    const above = obstacle.y - gap - height;
    const below = obstacle.y + obstacle.height + gap;
    const left = obstacle.x - gap - width;
    const right = obstacle.x + obstacle.width + gap;
    push(bounds.left, above);
    push(maxX, above);
    push((bounds.left + maxX) / 2, above);
    push(bounds.left, below);
    push(maxX, below);
    push((bounds.left + maxX) / 2, below);
    push(left, bounds.top);
    push(left, maxY);
    push(right, bounds.top);
    push(right, maxY);
  }

  const step = 24;
  for (let y = bounds.top; y <= maxY + 0.001; y += step) {
    for (let x = bounds.left; x <= maxX + 0.001; x += step) {
      push(Math.min(x, maxX), Math.min(y, maxY));
    }
  }

  const score = (x, y) => {
    const cx = x + width / 2;
    const cy = y + height / 2;
    let value = 0;
    if (obstacles.length === 0) {
      const midX = (bounds.left + bounds.right) / 2;
      const midY = (bounds.top + bounds.bottom) / 2;
      value = (cx - midX) ** 2 + (cy - midY) ** 2;
    }
    for (const obstacle of obstacles) {
      const ox = obstacle.x + obstacle.width / 2;
      const oy = obstacle.y + obstacle.height / 2;
      value += (cx - ox) ** 2 + (cy - oy) ** 2;
    }
    if (previous) {
      value += ((x - previous.x) ** 2 + (y - previous.y) ** 2) * 0.35;
    }
    return value;
  };

  let best = null;
  let bestScore = -1;
  let bestTravel = null;
  let bestTravelScore = -1;
  for (const candidate of candidates) {
    if (!fits(candidate.x, candidate.y, width, height, bounds) || !clearOf(candidate.x, candidate.y)) {
      continue;
    }
    const value = score(candidate.x, candidate.y);
    if (value > bestScore) {
      bestScore = value;
      best = candidate;
    }
    if (traveled(candidate.x, candidate.y) && value > bestTravelScore) {
      bestTravelScore = value;
      bestTravel = candidate;
    }
  }
  if (bestTravel) return { x: bestTravel.x, y: bestTravel.y };
  if (best) return { x: best.x, y: best.y };
  return { x: bounds.left, y: bounds.top };
}

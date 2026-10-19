const COLORS = ["#9f1239", "#e11d48", "#fb7185", "#fda4af", "#ff8fab"];

export function buildConfetti(count, random = Math.random) {
  const pieces = [];
  for (let index = 0; index < count; index += 1) {
    pieces.push({
      left: random() * 100,
      delay: random() * 0.45,
      duration: 2.2 + random() * 2,
      size: 8 + random() * 10,
      rotate: random() * 360,
      drift: (random() - 0.5) * 80,
      color: COLORS[index % COLORS.length],
      heart: index % 3 === 0,
    });
  }
  return pieces;
}

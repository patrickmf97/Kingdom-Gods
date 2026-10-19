export type VillageDecoration = {
  key: string;
  x: number;
  y: number;
  scale?: number;
};

function rng(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

const decor: VillageDecoration[] = [];
const forestRandom = rng(81725);
// The canopy frames the village, while the central square and every doorway
// have generous, intentionally open approaches.
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 25; col++) {
    const x = 100 + col * 103 + (forestRandom() - 0.5) * 64;
    const y = 185 + row * 87 + (forestRandom() - 0.5) * 42;
    if ((x > 560 && x < 850 && y > 350) || (x > 1910 && x < 2290 && y < 420))
      continue;
    decor.push({
      key: forestRandom() > 0.42 ? "tree1" : "pine",
      x: Math.round(x),
      y: Math.round(y),
      scale: 0.8 + forestRandom() * 0.35,
    });
  }
}
for (let i = 0; i < 102; i++) {
  const left = i % 2 === 0;
  const x = left ? 85 + forestRandom() * 220 : 2285 + forestRandom() * 230;
  const y = 520 + forestRandom() * 1280;
  decor.push({
    key: i % 3 === 0 ? "tree2" : "tree1",
    x: Math.round(x),
    y: Math.round(y),
    scale: 0.85 + forestRandom() * 0.3,
  });
}
for (let i = 0; i < 29; i++) {
  decor.push({
    key: i % 3 === 0 ? "pine" : "tree2",
    x: 550 + Math.round(forestRandom() * 1580),
    y: 1480 + Math.round(forestRandom() * 340),
    scale: 0.95 + forestRandom() * 0.25,
  });
}
decor.push(
  { key: "tree2", x: 531, y: 727 },
  { key: "tree1", x: 851, y: 600, scale: 0.85 },
  { key: "tree2", x: 862, y: 1205 },
  { key: "tree1", x: 1450, y: 455, scale: 0.85 },
  { key: "tree2", x: 1710, y: 565 },
  { key: "tree1", x: 1830, y: 1200 },
  { key: "tree2", x: 1490, y: 1347 },
  { key: "tree1", x: 2045, y: 1210 },
  { key: "pine", x: 2235, y: 515 },
  { key: "pine", x: 1980, y: 470 },
);
export const villageDecor = decor.filter((item) => {
  // Keep the mill, bakery, and their footpaths clear of canopy silhouettes.
  const nearMill = item.x > 1120 && item.x < 1390 && item.y > 230 && item.y < 565;
  const nearBakery = item.x > 1090 && item.x < 1510 && item.y > 1260 && item.y < 1660;
  const bridgeApproach = item.x >= 220 && item.x <= 315 && item.y >= 850 && item.y <= 960;
  return !nearMill && !nearBakery && !bridgeApproach;
});

import type Phaser from "phaser";
import { WORLD_W, WORLD_H } from "./data";

type Ctx = CanvasRenderingContext2D;
type Appearance = { skin: string; hair: string; outfit: string; eyes?: string };
export type VillageDecoration = {
  key: string;
  x: number;
  y: number;
  scale?: number;
};

// Artwork is painted at half resolution and enlarged with nearest-neighbour
// sampling. One deliberate square in these drawings is two world pixels.
const P = {
  grass: "#81946a",
  grassLight: "#92a477",
  grassDark: "#71865e",
  leafDark: "#344b38",
  leaf: "#526b42",
  leafLight: "#6f8551",
  leafSun: "#8fa062",
  path: "#c2b08b",
  pathLight: "#d0bf99",
  pathDark: "#ad9874",
  timber: "#574434",
  timberLight: "#816446",
  cream: "#d4c2a0",
  stone: "#95937f",
  roof: "#994e3b",
  roofLight: "#b76747",
  roofDark: "#713d34",
  water: "#537f7e",
  waterLight: "#7aa5a0",
  ink: "#333c32",
  gold: "#d5b674",
};

function rng(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
function rect(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
) {
  c.fillStyle = fill;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function poly(c: Ctx, points: number[][], fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  points.forEach(([x, y], i) =>
    i
      ? c.lineTo(Math.round(x), Math.round(y))
      : c.moveTo(Math.round(x), Math.round(y)),
  );
  c.closePath();
  c.fill();
}
function ellipse(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
) {
  // Stepped scanlines retain the illustrated pixel edge without antialiasing.
  for (let i = -Math.ceil(ry); i <= ry; i++) {
    const span = Math.round(
      rx * Math.sqrt(Math.max(0, 1 - (i * i) / (ry * ry))),
    );
    rect(c, x - span, y + i, span * 2 + 1, 1, fill);
  }
}
function texture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  paint: (c: Ctx) => void,
) {
  if (scene.textures.exists(key)) return;
  const small = document.createElement("canvas");
  small.width = Math.ceil(w / 2);
  small.height = Math.ceil(h / 2);
  const ctx = small.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const final = canvas.getContext("2d")!;
  final.imageSmoothingEnabled = false;
  final.drawImage(small, 0, 0, w, h);
  scene.textures.addCanvas(key, canvas);
}
function shade(hex: string, amount: number) {
  const parsed = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "b49072";
  const num = parseInt(parsed, 16);
  return (
    "#" +
    [16, 8, 0]
      .map((s) =>
        Math.max(0, Math.min(255, ((num >> s) & 255) + amount))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function line(c: Ctx, points: number[][], width: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}
function stones(c: Ctx, x: number, y: number, w: number, h: number, seed = 3) {
  const random = rng(seed);
  rect(c, x, y, w, h, "#777b69");
  for (let py = y; py < y + h; py += 5) {
    for (let px = x - ((py - y) % 10 === 0 ? 0 : 5); px < x + w; px += 10) {
      const sx = Math.max(px, x),
        ex = Math.min(px + 9, x + w);
      rect(
        c,
        sx,
        py,
        ex - sx,
        Math.min(4, y + h - py),
        ["#969883", "#a4a58e", "#898d7c"][Math.floor(random() * 3)],
      );
      rect(c, sx + 1, py, Math.max(0, ex - sx - 2), 1, "#b0ad96");
    }
  }
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

function paintGround(c: Ctx) {
  const w = WORLD_W / 2,
    h = WORLD_H / 2,
    random = rng(837461);
  rect(c, 0, 0, w, h, P.grass);
  // Broken meadow patches, shaded without noisy full-screen dithering.
  for (let i = 0; i < 175; i++) {
    const x = random() * w,
      y = random() * h;
    ellipse(
      c,
      x,
      y,
      25 + random() * 56,
      12 + random() * 25,
      random() > 0.4 ? "#7a8f64" : "#8a9c70",
    );
  }
  for (let i = 0; i < 10000; i++) {
    const x = Math.round(random() * w),
      y = Math.round(random() * h);
    rect(
      c,
      x,
      y,
      1 + Math.floor(random() * 3),
      1,
      random() > 0.5 ? "#99a77b" : "#6c825b",
    );
    if (i % 8 === 0) rect(c, x + 1, y - 2, 1, 2, "#9cab80");
  }
  // The slate ridge, mossy terraces, and a clear creek give the map a place.
  poly(
    c,
    [
      [0, 0],
      [w, 0],
      [w, 78],
      [1160, 115],
      [1020, 78],
      [878, 132],
      [735, 84],
      [584, 122],
      [451, 91],
      [301, 148],
      [144, 116],
      [0, 179],
    ],
    "#667a6f",
  );
  poly(
    c,
    [
      [0, 0],
      [w, 0],
      [w, 57],
      [1158, 78],
      [1035, 48],
      [879, 94],
      [757, 45],
      [590, 82],
      [446, 48],
      [292, 98],
      [144, 71],
      [0, 121],
    ],
    "#778a7b",
  );
  for (let i = 0; i < 180; i++) {
    const x = random() * w,
      y = random() * 90;
    rect(c, x, y, 5 + random() * 12, 2, "#849385");
    rect(c, x, y + 2, 3 + random() * 8, 2, "#556e65");
  }
  const creek = [
    [-60, 218],
    [51, 262],
    [122, 351],
    [194, 454],
    [160, 565],
    [137, 652],
    [203, 777],
    [150, 887],
    [68, 990],
  ];
  line(c, creek, 79, "#647657");
  line(c, creek, 68, "#a0a082");
  line(c, creek, 56, "#497674");
  line(c, creek, 46, P.water);
  for (let i = 0; i < 230; i++) {
    const n = Math.floor(random() * (creek.length - 1));
    const t = random();
    const x =
      creek[n][0] * (1 - t) + creek[n + 1][0] * t + (random() - 0.5) * 34;
    const y = creek[n][1] * (1 - t) + creek[n + 1][1] * t;
    rect(c, x, y, 3 + random() * 13, 1, random() > 0.6 ? "#9db6a7" : "#638e89");
  }
  // Village lanes converge on the market square, then lead to the homesteads.
  const paths = [
    [
      [630, 238],
      [629, 315],
      [628, 421],
    ],
    [
      [615, 728],
      [653, 698],
      [728, 645],
    ],
    [
      [204, 456],
      [290, 438],
      [388, 417],
      [510, 414],
      [628, 421],
      [739, 436],
      [941, 448],
    ],
    [
      [355, 310],
      [365, 348],
      [388, 417],
    ],
    [
      [500, 540],
      [508, 476],
      [510, 414],
    ],
    [
      [782, 330],
      [755, 382],
      [739, 436],
    ],
    [
      [820, 550],
      [803, 492],
      [739, 436],
    ],
    [
      [641, 413],
      [642, 470],
      [696, 545],
      [728, 645],
      [849, 723],
    ],
    [
      [941, 448],
      [995, 376],
      [1058, 274],
      [1055, 170],
    ],
    [
      [388, 417],
      [346, 502],
      [308, 618],
      [315, 759],
      [408, 953],
    ],
  ];
  paths.forEach((points, i) => {
    line(c, points, i === 2 ? 34 : 25, "#9e9573");
    line(c, points, i === 2 ? 29 : 21, P.path);
    line(c, points, i === 2 ? 20 : 13, P.pathLight);
  });
  ellipse(c, 578, 408, 113, 45, "#a5a084");
  ellipse(c, 578, 406, 107, 40, "#b5ae91");
  for (let y = 374; y < 445; y += 6) {
    for (let x = 477; x < 682; x += 9) {
      if ((x - 578) ** 2 / 108 ** 2 + (y - 406) ** 2 / 39 ** 2 > 1) continue;
      rect(
        c,
        x + (y % 12 ? 4 : 0),
        y,
        7,
        4,
        ["#c4bca0", "#bcb395", "#a69f87"][Math.floor(random() * 3)],
      );
    }
  }
  // The full deck joins both dry banks; its painted rails match the collision span.
  rect(c, 142, 435, 101, 33, "#4b5948");
  rect(c, 142, 430, 101, 34, "#745b41");
  for (let x = 143; x < 243; x += 5) {
    rect(c, x, 430, Math.min(4, 243 - x), 34, "#a1865d");
    rect(c, x, 431, Math.min(3, 243 - x), 1, "#c0a172");
  }
  rect(c, 142, 428, 101, 3, "#5d4b35");
  rect(c, 142, 465, 101, 3, "#5d4b35");
  for (let x = 142; x < 243; x += 17) {
    rect(c, x, 424, 3, 8, "#b09968");
    rect(c, x, 461, 3, 8, "#b09968");
  }
  // Small grasses and flowers are clustered along lawn edges.
  for (let i = 0; i < 360; i++) {
    const x = random() * w,
      y = 150 + random() * (h - 180);
    if (x > 280 && x < 1080 && y > 270 && y < 700) continue;
    rect(c, x, y, 1, 3, "#587549");
    rect(c, x - 2, y - 1, 2, 1, i % 3 === 0 ? "#d4cb97" : "#aab58a");
    if (i % 7 === 0) rect(c, x + 2, y + 1, 2, 1, "#bd9278");
  }
  // A quiet fenced kitchen garden behind the inn.
  rect(c, 396, 557, 80, 39, "#806949");
  for (let y = 561; y < 595; y += 7) {
    rect(c, 400, y, 73, 2, "#4e6240");
    for (let x = 402; x < 473; x += 8) rect(c, x, y - 2, 3, 3, "#88a05b");
  }
  fence(c, 391, 553, 90);
  fence(c, 391, 598, 90);
  // Long shadows give the eastern orchard breathing room.
  for (let i = 0; i < 11; i++) {
    const x = 899 + (i % 4) * 31,
      y = 560 + Math.floor(i / 4) * 36;
    ellipse(c, x + 3, y + 5, 17, 7, "#718461");
    bush(c, x, y, i);
  }
}

function fence(c: Ctx, x: number, y: number, w: number) {
  rect(c, x, y - 4, w, 2, "#685740");
  rect(c, x, y + 1, w, 2, "#8c7752");
  for (let i = x; i <= x + w; i += 10) {
    rect(c, i, y - 8, 3, 14, "#a68c61");
    rect(c, i, y - 8, 1, 13, "#c0a674");
  }
}
function bush(c: Ctx, x: number, y: number, seed: number) {
  const random = rng(seed + 882);
  ellipse(c, x, y, 11, 7, "#456344");
  ellipse(c, x - 2, y - 3, 10, 6, "#668250");
  for (let i = 0; i < 15; i++)
    rect(c, x - 9 + random() * 16, y - 7 + random() * 9, 2, 1, "#8b9b60");
}

function window(
  c: Ctx,
  x: number,
  y: number,
  width = 9,
  tall = 12,
  glow = false,
) {
  rect(c, x - 2, y - 2, width + 4, tall + 4, P.timber);
  rect(c, x, y, width, tall, glow ? "#ddb973" : "#687d7c");
  rect(c, x + 1, y + 1, width - 2, tall - 3, glow ? "#f0d394" : "#95ae9f");
  rect(c, x + Math.floor(width / 2), y, 1, tall, P.timber);
  rect(c, x, y + 5, width, 1, P.timber);
  rect(c, x - 3, y + tall + 2, width + 6, 2, "#b29a6a");
  rect(c, x - 5, y, 3, tall + 1, "#7d8360");
  rect(c, x + width + 2, y, 3, tall + 1, "#66704f");
  rect(c, x - 4, y + 2, 1, tall - 3, "#a0a17a");
}
function door(c: Ctx, x: number, y: number, width = 12, height = 22) {
  rect(c, x - 2, y - 2, width + 4, height + 3, "#4b4033");
  rect(c, x, y, width, height, "#856442");
  for (let i = 2; i < width; i += 3)
    rect(c, x + i, y + 1, 1, height - 1, "#624d37");
  rect(c, x + 1, y + 1, width - 2, 1, "#b9955b");
  rect(c, x + 1, y + 6, width - 2, 2, "#534536");
  rect(c, x + 1, y + height - 6, width - 2, 2, "#534536");
  rect(c, x + width - 3, y + height / 2, 1, 2, "#e5c273");
}
function roof(
  c: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  green = false,
) {
  const random = rng(seed),
    dark = green ? "#425d53" : P.roofDark,
    base = green ? "#57756a" : P.roof,
    light = green ? "#70867a" : P.roofLight;
  poly(
    c,
    [
      [x + 11, y],
      [x + width - 11, y],
      [x + width, y + height],
      [x, y + height],
    ],
    dark,
  );
  poly(
    c,
    [
      [x + 11, y + 2],
      [x + width - 12, y + 2],
      [x + width - 3, y + height - 3],
      [x + 3, y + height - 3],
    ],
    base,
  );
  c.save();
  c.beginPath();
  c.moveTo(x + 11, y + 2);
  c.lineTo(x + width - 12, y + 2);
  c.lineTo(x + width - 3, y + height - 3);
  c.lineTo(x + 3, y + height - 3);
  c.closePath();
  c.clip();
  for (let py = y + 3; py < y + height - 2; py += 5) {
    rect(c, x, py + 4, width, 1, dark);
    for (let px = x + (py % 10 ? 0 : 4); px < x + width; px += 8) {
      rect(c, px, py, 7, 1, random() > 0.3 ? light : base);
      rect(c, px + 7, py + 1, 1, 3, dark);
      if (random() > 0.72)
        rect(c, px + 1, py + 1, 2, 1, green ? "#819287" : "#ca7750");
    }
  }
  c.restore();
  rect(c, x + 11, y, width - 22, 2, green ? "#83978a" : "#c28159");
  rect(c, x - 1, y + height, width + 2, 3, "#473e31");
  rect(c, x, y + height, width, 1, "#ab8051");
}
function chimney(c: Ctx, x: number, y: number) {
  stones(c, x, y, 10, 17, 26);
  rect(c, x - 1, y, 12, 3, "#6b6659");
  rect(c, x + 2, y - 2, 7, 2, "#d0b491");
  ellipse(c, x + 5, y - 7, 4, 3, "#b6b5a399");
  ellipse(c, x + 8, y - 14, 5, 3, "#c6c4ae77");
}
function flowerBox(c: Ctx, x: number, y: number, w = 13) {
  rect(c, x, y, w, 4, "#775039");
  rect(c, x + 1, y, w - 2, 1, "#b28355");
  for (let i = 1; i < w; i += 3) {
    rect(c, x + i, y - 3, 2, 3, "#61744a");
    rect(c, x + i, y - 4, 2, 2, i % 2 ? "#d6b071" : "#c28170");
  }
}

function house(
  c: Ctx,
  w: number,
  h: number,
  style: "orphanage" | "inn" | "cottage",
) {
  const big = style === "orphanage",
    inn = style === "inn";
  const x = 8,
    wallW = w - 23,
    wallY = big ? 40 : 34,
    wallH = h - wallY - 8;
  ellipse(c, w / 2 + 4, h - 5, w / 2 - 7, 6, "#3c533a44");
  poly(
    c,
    [
      [x + wallW, wallY],
      [w - 5, wallY - 5],
      [w - 5, h - 11],
      [x + wallW, h - 5],
    ],
    "#ac9e7f",
  );
  rect(c, x, wallY, wallW, wallH, P.cream);
  rect(c, x, h - 17, wallW, 11, "#a9a389");
  stones(c, x, h - 13, wallW, 8, 5);
  rect(c, x, wallY, wallW, 5, "#9e8d6b");
  [
    x,
    x + Math.round(wallW * 0.34),
    x + Math.round(wallW * 0.68),
    x + wallW - 3,
  ].forEach((px) => rect(c, px, wallY, 3, wallH - 7, P.timber));
  rect(c, x, wallY + 19, wallW, 3, P.timber);
  rect(c, x, h - 18, wallW, 3, P.timber);
  // White plaster pockets and diagonal structural braces under the eaves.
  poly(
    c,
    [
      [x + 3, wallY + 3],
      [x + 14, wallY + 18],
      [x + 17, wallY + 18],
      [x + 5, wallY + 3],
    ],
    P.timberLight,
  );
  poly(
    c,
    [
      [x + wallW - 5, wallY + 3],
      [x + wallW - 18, wallY + 18],
      [x + wallW - 15, wallY + 18],
      [x + wallW - 3, wallY + 3],
    ],
    P.timberLight,
  );
  roof(c, x - 5, 12, wallW + 11, wallY - 11, big ? 42 : 83);
  chimney(c, w - 30, 9);
  const front = Math.round(w / 2) - 8;
  door(c, front, h - 30, 14, 24);
  rect(c, front - 4, h - 6, 22, 3, "#a49d86");
  rect(c, front - 5, h - 3, 25, 2, "#c5bda2");
  window(c, x + 9, wallY + 7, 10, 11, true);
  window(c, x + wallW - 21, wallY + 7, 10, 11, true);
  if (big) {
    window(c, front + 2, wallY + 7, 9, 11, true);
    window(c, x + 10, h - 31, 10, 10);
    window(c, x + wallW - 21, h - 31, 10, 10);
    flowerBox(c, x + 8, h - 17, 15);
    flowerBox(c, x + wallW - 23, h - 17, 15);
    rect(c, front + 3, 22, 7, 9, "#d1bc93");
    rect(c, front + 6, 23, 1, 6, "#796847");
    rect(c, front + 4, 25, 5, 1, "#796847");
  } else {
    window(c, x + 10, h - 31, 9, 10, true);
    window(c, x + wallW - 19, h - 31, 8, 10);
    flowerBox(c, x + 7, h - 18, 15);
  }
  // A hanging sign, stacked firewood, and a little doorstep planter.
  if (inn) {
    rect(c, w - 21, wallY + 9, 12, 2, P.timber);
    rect(c, w - 12, wallY + 10, 1, 5, P.timber);
    rect(c, w - 21, wallY + 15, 13, 14, "#584638");
    rect(c, w - 20, wallY + 16, 11, 12, "#d0af72");
    rect(c, w - 17, wallY + 19, 4, 6, "#647246");
    rect(c, w - 18, wallY + 19, 6, 3, "#778250");
  }
  for (let iy = 0; iy < 2; iy++)
    for (let ix = 0; ix < 4; ix++) {
      rect(c, w - 23 + ix * 4, h - 10 - iy * 4, 4, 3, "#694d32");
      rect(c, w - 23 + ix * 4, h - 10 - iy * 4, 1, 2, "#ae8a58");
    }
  rect(c, 3, h - 14, 7, 9, "#a47752");
  bush(c, 6, h - 15, 84);
}

function paintTree(c: Ctx, variant: number, pine = false) {
  const random = rng(38 + variant * 193),
    w = pine ? 45 : 59,
    h = pine ? 83 : 73;
  ellipse(c, w / 2 + 5, h - 6, w * 0.43, 6, "#334d363e");
  rect(c, w / 2 - 3, h - 29, 7, 24, "#514934");
  rect(c, w / 2 + 1, h - 28, 2, 21, "#8b7950");
  rect(c, w / 2 - 5, h - 8, 12, 3, "#5e553a");
  if (pine) {
    for (let layer = 0; layer < 5; layer++) {
      const y = 5 + layer * 11,
        r = 7 + layer * 3;
      poly(
        c,
        [
          [w / 2, y],
          [w / 2 - r, y + 22],
          [w / 2 - r + 6, y + 21],
          [w / 2 + r, y + 22],
        ],
        layer % 2 ? "#3d5d48" : "#45694e",
      );
      poly(
        c,
        [
          [w / 2, y + 2],
          [w / 2 - r + 2, y + 19],
          [w / 2 - 1, y + 17],
        ],
        "#637e53",
      );
      for (let j = 0; j < 12; j++)
        rect(
          c,
          w / 2 - r + random() * r * 2,
          y + 14 + random() * 6,
          2,
          1,
          "#799261",
        );
    }
    return;
  }
  const centers = [
    [27, 20, 19, 15],
    [16, 30, 13, 16],
    [40, 31, 15, 16],
    [28, 40, 20, 15],
    [27, 16, 14, 12],
  ];
  centers.forEach(([x, y, rx, ry]) => ellipse(c, x, y + 4, rx, ry, P.leafDark));
  centers.forEach(([x, y, rx, ry], i) =>
    ellipse(c, x - 2, y, rx - 1, ry - 2, i % 2 ? P.leaf : P.leafLight),
  );
  for (let i = 0; i < 180; i++) {
    const x = 6 + random() * 44,
      y = 7 + random() * 45;
    if (((x - 28) / 24) ** 2 + ((y - 29) / 24) ** 2 > 1) continue;
    rect(
      c,
      x,
      y,
      2 + random() * 3,
      1 + random() * 2,
      [P.leafDark, P.leaf, P.leafLight, P.leafSun][Math.floor(random() * 4)],
    );
  }
  for (let i = 0; i < 17; i++)
    rect(c, 10 + random() * 31, 11 + random() * 22, 3, 1, "#a3ac72");
}

function paintMill(c: Ctx) {
  ellipse(c, 48, 79, 40, 6, "#354d3744");
  // The tapered stone tower carries a timber cap and a front-facing doorway.
  poly(c, [[34, 24], [60, 24], [68, 76], [26, 76]], "#a6a087");
  poly(c, [[34, 24], [45, 24], [40, 76], [26, 76]], "#c3b998");
  poly(c, [[55, 24], [60, 24], [68, 76], [58, 76]], "#817f6c");
  for (let y = 31; y < 74; y += 6) {
    const left = 34 - Math.floor((y - 24) / 7);
    const width = 26 + Math.floor((y - 24) / 3.5);
    rect(c, left, y, width, 1, "#928c74");
    for (let x = left + (y % 12 ? 5 : 10); x < left + width; x += 11)
      rect(c, x, y - 5, 1, 5, "#a8a083");
  }
  roof(c, 24, 7, 46, 20, 419, true);
  rect(c, 44, 29, 7, 7, "#62533b");
  rect(c, 46, 30, 3, 3, "#d6bc7c");
  window(c, 44, 43, 7, 9, true);
  door(c, 40, 59, 14, 20);
  rect(c, 36, 78, 23, 3, "#b7ab89");
  rect(c, 33, 81, 29, 2, "#cec19d");
  // Flour sacks, a grinding stone, and wheat make its trade legible at a glance.
  ellipse(c, 75, 72, 10, 7, "#746e56");
  ellipse(c, 75, 69, 10, 6, "#ada68a");
  ellipse(c, 75, 69, 3, 2, "#615e49");
  rect(c, 68, 75, 16, 2, "#847652");
  for (const [x, y] of [[14, 66], [20, 72]]) {
    rect(c, x - 4, y, 9, 10, "#b4a27b");
    rect(c, x - 3, y - 2, 7, 3, "#d6c49a");
    rect(c, x - 1, y - 3, 3, 3, "#827050");
    rect(c, x, y + 2, 1, 6, "#e0cfaa");
  }
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 2;
    rect(c, x, 52 + (i % 2), 1, 11, "#b4a260");
    rect(c, x - 1, 51 + (i % 2), 3, 3, "#d5bd77");
  }
  rect(c, 6, 61, 14, 4, "#826343");
}

function paintMillSails(c: Ctx) {
  // A single small texture rotates as a unit; no extra meshes or frame atlas.
  for (let i = 0; i < 4; i++) {
    c.save();
    c.translate(35, 35);
    c.rotate((Math.PI / 2) * i);
    rect(c, -1, -32, 3, 34, "#655037");
    rect(c, 2, -31, 10, 24, "#dfd0aa");
    rect(c, 3, -30, 8, 22, "#eee1bb");
    rect(c, 2, -31, 10, 1, "#b49667");
    for (let y = -25; y < -7; y += 6) rect(c, 2, y, 10, 1, "#b6a47d");
    rect(c, 6, -30, 1, 22, "#d1c097");
    rect(c, -1, -31, 1, 30, "#a68b5e");
    c.restore();
  }
  ellipse(c, 35, 35, 5, 5, "#655037");
  ellipse(c, 35, 34, 3, 3, "#c1a573");
  rect(c, 34, 33, 2, 2, "#ece0b7");
}

function paintBakery(c: Ctx) {
  ellipse(c, 44, 66, 40, 5, "#354d3744");
  rect(c, 8, 27, 60, 36, P.cream);
  stones(c, 8, 56, 60, 8, 785);
  rect(c, 8, 27, 3, 30, P.timber);
  rect(c, 34, 27, 3, 30, P.timber);
  rect(c, 65, 27, 3, 30, P.timber);
  rect(c, 8, 38, 60, 3, P.timber);
  roof(c, 3, 11, 71, 20, 645);
  chimney(c, 57, 4);
  door(c, 42, 43, 13, 21);
  rect(c, 38, 64, 22, 3, "#b7ab89");
  window(c, 16, 44, 13, 10, true);
  // A loaf-shaped hanging sign sits beside the bright shop window.
  rect(c, 9, 31, 21, 2, P.timber);
  rect(c, 12, 32, 1, 3, P.timber);
  rect(c, 26, 32, 1, 3, P.timber);
  rect(c, 10, 34, 19, 9, "#795338");
  rect(c, 11, 35, 17, 7, "#c19a5e");
  ellipse(c, 19, 38, 6, 3, "#f0d099");
  for (const x of [15, 19, 23]) rect(c, x, 36, 1, 3, "#b48344");
  // A separate stone oven with a visible amber fire and a soot-dark mouth.
  stones(c, 66, 39, 18, 25, 941);
  poly(c, [[65, 39], [69, 34], [80, 34], [85, 39]], "#b4a58a");
  rect(c, 69, 46, 12, 15, "#4a3d30");
  rect(c, 72, 43, 6, 18, "#4a3d30");
  rect(c, 71, 55, 9, 5, "#b86132");
  rect(c, 73, 52, 3, 7, "#efb45c");
  rect(c, 77, 54, 2, 5, "#f5cf7a");
  rect(c, 68, 61, 15, 3, "#938367");
  rect(c, 64, 65, 20, 2, "#b6a684");
  for (let i = 0; i < 3; i++) {
    rect(c, 66 + i * 5, 31, 4, 2, "#ac8757");
    rect(c, 67 + i * 5, 30, 2, 1, "#dec089");
  }
  rect(c, 3, 56, 9, 9, "#b9a77f");
  rect(c, 4, 54, 7, 3, "#d6c59e");
  rect(c, 6, 58, 2, 4, "#e8d9b3");
  rect(c, 56, 57, 8, 7, "#806344");
  for (let i = 0; i < 3; i++) rect(c, 57, 58 + i * 2, 6, 1, "#b48c55");
}

function paintForge(c: Ctx) {
  ellipse(c, 47, 67, 43, 5, "#354d3744");
  stones(c, 8, 29, 64, 35, 127);
  poly(
    c,
    [
      [72, 29],
      [83, 22],
      [83, 58],
      [72, 64],
    ],
    "#706f61",
  );
  roof(c, 3, 9, 78, 24, 21, true);
  stones(c, 65, 4, 11, 25, 86);
  rect(c, 63, 3, 15, 4, "#a2a18a");
  ellipse(c, 72, 0, 7, 3, "#b4b5a477");
  rect(c, 12, 35, 28, 27, "#454135");
  rect(c, 14, 37, 24, 25, "#665440");
  rect(c, 18, 40, 16, 19, "#2f312e");
  rect(c, 21, 47, 10, 9, "#bf6239");
  rect(c, 23, 50, 7, 5, "#e3aa4e");
  rect(c, 25, 48, 3, 7, "#f1ce73");
  rect(c, 20, 57, 15, 3, "#74684d");
  door(c, 49, 41, 14, 21);
  window(c, 47, 20, 10, 10, true);
  rect(c, 32, 59, 18, 4, "#3b4340");
  rect(c, 37, 54, 10, 5, "#576361");
  poly(
    c,
    [
      [30, 53],
      [48, 53],
      [54, 51],
      [51, 56],
      [32, 56],
    ],
    "#92948a",
  );
  rect(c, 34, 52, 11, 1, "#c0bfa6");
  rect(c, 36, 63, 12, 3, "#776649");
  for (let i = 0; i < 4; i++) {
    rect(c, 73 + i * 3, 41, 1, 14, "#c1bca6");
    rect(c, 72 + i * 3, 48, 3, 1, "#c1bca6");
  }
  rect(c, 70, 43, 15, 2, "#5f4e38");
  ellipse(c, 80, 64, 9, 3, "#526047");
  for (let i = 0; i < 12; i++)
    rect(
      c,
      73 + ((i * 11) % 15),
      59 + ((i * 7) % 6),
      3,
      2,
      i % 2 ? "#767b74" : "#555f5b",
    );
}

function paintMarket(c: Ctx) {
  ellipse(c, 44, 56, 40, 5, "#40543944");
  rect(c, 7, 25, 3, 30, "#66533b");
  rect(c, 74, 25, 3, 30, "#66533b");
  rect(c, 9, 37, 65, 18, "#806442");
  rect(c, 11, 38, 61, 3, "#b08b57");
  for (let x = 11; x < 72; x += 9) {
    rect(c, x, 42, 1, 12, "#5c4a35");
    rect(c, x + 1, 43, 6, 1, "#a17a48");
  }
  rect(c, 8, 32, 68, 8, "#413f31");
  poly(
    c,
    [
      [12, 5],
      [72, 5],
      [83, 28],
      [1, 28],
    ],
    "#634335",
  );
  poly(
    c,
    [
      [12, 7],
      [71, 7],
      [80, 26],
      [4, 26],
    ],
    "#d4c5a0",
  );
  for (let i = 0; i < 5; i++) {
    const x = 14 + i * 13;
    poly(
      c,
      [
        [x, 7],
        [x + 6, 7],
        [x + 10, 26],
        [x + 1, 26],
      ],
      "#a35542",
    );
    rect(c, x + 1, 28, 9, 5, "#944b3b");
    rect(c, x + 1, 32, 7, 1, "#753d31");
  }
  rect(c, 3, 27, 78, 2, "#b49b78");
  for (let x = 6; x < 79; x += 13) {
    rect(c, x, 29, 6, 4, "#d3c39c");
    rect(c, x, 32, 5, 1, "#b8a47c");
  }
  // Bread, apples, herbs, and porcelain jars on the merchant's counter.
  for (let i = 0; i < 5; i++) {
    ellipse(c, 16 + i * 4, 35, 3, 2, "#c59c58");
    rect(c, 15 + i * 4, 33, 2, 1, "#ead29a");
  }
  rect(c, 39, 32, 17, 7, "#9b7446");
  for (let i = 0; i < 9; i++) {
    rect(c, 41 + ((i * 5) % 13), 30 + (i % 3) * 2, 3, 3, "#a45b43");
    rect(c, 42 + ((i * 5) % 13), 29 + (i % 3) * 2, 1, 1, "#5d7946");
  }
  rect(c, 59, 32, 6, 7, "#c7b796");
  rect(c, 60, 30, 4, 3, "#aaa387");
  bush(c, 68, 34, 26);
  rect(c, 78, 43, 7, 11, "#9b8258");
  rect(c, 78, 46, 7, 1, "#554b37");
  rect(c, 78, 51, 7, 1, "#554b37");
  rect(c, 1, 48, 7, 8, "#a79570");
  rect(c, 2, 47, 5, 2, "#d0bd8b");
}

function paintFarmFloor(c: Ctx, planted = true, ripe = true) {
  const random = rng(13076);
  ellipse(c, 67, 97, 61, 6, "#3d513639");
  rect(c, 12, 33, 106, 60, "#9c8760");
  rect(c, 15, 36, 100, 54, "#776345");
  for (let row = 0; row < 6; row++) {
    const y = 40 + row * 8;
    rect(c, 18, y + 4, 91, 3, "#554e36");
    rect(c, 18, y + 4, 91, 1, "#665335");
    for (let x = 20; x < 111; x += 5) {
      if (!planted) {
        if (random() > 0.55) rect(c, x, y + 3, 2, 1, "#9c8352");
        continue;
      }
      const tall = (ripe ? 5 : 3) + Math.round(random() * 2);
      rect(c, x + 1, y - tall + 5, 1, tall, ripe ? "#b5a265" : "#527345");
      rect(c, x, y - tall + 4, 3, ripe ? 3 : 2, ripe ? "#d1b56d" : "#86a95c");
      rect(c, x - 1, y - tall + 5, 1, 2, ripe ? "#9d9956" : "#64884b");
      rect(c, x + 3, y - tall + 6, 1, 2, ripe ? "#e0c784" : "#a3ba73");
    }
  }
  ellipse(c, 33, 15, 11, 6, "#967b46");
  ellipse(c, 31, 12, 11, 6, "#d0b16c");
  for (let i = 0; i < 15; i++)
    rect(c, 21 + random() * 21, 9 + random() * 9, 1, 3, "#e0c185");
  rect(c, 31, 7, 1, 13, "#876c40");
  rect(c, 54, 14, 3, 15, "#8f7450");
  rect(c, 45, 16, 20, 2, "#8f7450");
  rect(c, 51, 10, 9, 11, "#788061");
  rect(c, 52, 4, 7, 6, "#c4aa7f");
  rect(c, 49, 4, 13, 2, "#6f6045");
  rect(c, 55, 12, 1, 6, "#b6a172");
}

function paintFarmShed(c: Ctx) {
  // A modest tool shed keeps this visibly a working, attainable homestead.
  rect(c, 79, 15, 34, 24, "#a69b78");
  rect(c, 82, 19, 27, 20, "#b9b08a");
  rect(c, 82, 20, 2, 18, P.timber);
  rect(c, 106, 20, 2, 18, P.timber);
  roof(c, 75, 2, 42, 19, 881, true);
  door(c, 94, 23, 10, 17);
  window(c, 83, 23, 6, 6);
  rect(c, 114, 30, 1, 12, "#64573f");
  rect(c, 111, 28, 7, 2, "#9f9b83");
}

function paintFarmFence(c: Ctx, front: boolean) {
  if (front) {
    fence(c, 7, 96, 39);
    fence(c, 78, 96, 44);
    rect(c, 50, 90, 21, 4, "#b29d71");
  } else {
    fence(c, 7, 30, 65);
  }
}

function paintFarmSideFence(c: Ctx) {
  // Short depth-sorted sections preserve the actor's silhouette along a fence.
  rect(c, 2, 0, 2, 12, "#74674c");
  rect(c, 0, 4, 2, 6, "#9e865f");
  rect(c, 0, 4, 1, 6, "#c0a674");
}

function paintWell(c: Ctx) {
  ellipse(c, 25, 39, 22, 4, "#38523744");
  ellipse(c, 23, 30, 16, 9, "#666d61");
  ellipse(c, 23, 28, 17, 8, "#a9a38a");
  ellipse(c, 23, 27, 12, 5, "#444f47");
  ellipse(c, 23, 29, 10, 3, "#50716b");
  rect(c, 7, 29, 3, 6, "#969b84");
  rect(c, 13, 34, 8, 3, "#b6b399");
  rect(c, 25, 34, 8, 3, "#b6b399");
  rect(c, 9, 12, 3, 24, "#64563d");
  rect(c, 35, 12, 3, 24, "#64563d");
  rect(c, 10, 12, 1, 23, "#a48a5b");
  rect(c, 11, 19, 25, 3, "#8e764c");
  rect(c, 22, 19, 1, 13, "#c7b286");
  roof(c, 3, 3, 42, 13, 912);
  rect(c, 28, 29, 6, 7, "#a58b5b");
  rect(c, 28, 31, 6, 1, "#65563f");
  rect(c, 29, 27, 4, 1, "#a5a084");
  rect(c, 33, 23, 2, 6, "#75613f");
  rect(c, 34, 23, 5, 2, "#75613f");
}

function paintCrypt(c: Ctx) {
  const random = rng(422);
  ellipse(c, 44, 67, 38, 5, "#2e493747");
  poly(
    c,
    [
      [6, 57],
      [9, 26],
      [22, 11],
      [63, 11],
      [80, 29],
      [81, 57],
    ],
    "#686c60",
  );
  stones(c, 16, 20, 56, 38, 738);
  stones(c, 22, 12, 42, 12, 334);
  rect(c, 23, 11, 40, 3, "#abad96");
  rect(c, 15, 23, 59, 3, "#9fa18b");
  poly(
    c,
    [
      [29, 56],
      [29, 33],
      [34, 27],
      [51, 27],
      [57, 33],
      [57, 56],
    ],
    "#363e36",
  );
  poly(
    c,
    [
      [34, 56],
      [34, 35],
      [38, 31],
      [49, 31],
      [52, 35],
      [52, 56],
    ],
    "#222f2c",
  );
  rect(c, 25, 56, 36, 4, "#9d9d84");
  rect(c, 21, 60, 44, 4, "#8d927a");
  rect(c, 18, 64, 50, 4, "#b1ad90");
  rect(c, 22, 63, 41, 1, "#c8bea0");
  rect(c, 39, 17, 7, 8, "#4e594d");
  rect(c, 42, 17, 1, 8, "#8f9c80");
  rect(c, 39, 20, 7, 1, "#8f9c80");
  for (let i = 0; i < 48; i++) {
    const x = 13 + random() * 59,
      y = 12 + random() * 37;
    if (x > 27 && x < 60 && y > 26) continue;
    rect(c, x, y, 3, 1, "#7e8d63");
  }
  line(
    c,
    [
      [17, 13],
      [11, 23],
      [19, 34],
      [16, 55],
    ],
    3,
    "#625d40",
  );
  line(
    c,
    [
      [68, 9],
      [75, 24],
      [68, 39],
      [73, 55],
    ],
    3,
    "#555d3d",
  );
  bush(c, 9, 53, 17);
  bush(c, 74, 55, 27);
  rect(c, 22, 38, 3, 9, "#574734");
  rect(c, 61, 38, 3, 9, "#574734");
  rect(c, 21, 36, 5, 4, "#bc9658");
  rect(c, 62, 36, 4, 4, "#bc9658");
}

function paintSign(c: Ctx) {
  ellipse(c, 17, 37, 14, 3, "#3d533b44");
  rect(c, 7, 10, 3, 26, "#705a3e");
  rect(c, 24, 10, 3, 26, "#705a3e");
  rect(c, 3, 7, 28, 22, "#513f30");
  rect(c, 5, 9, 24, 18, "#9c7d50");
  rect(c, 5, 10, 24, 1, "#c0a271");
  rect(c, 5, 18, 24, 1, "#6c5539");
  rect(c, 7, 12, 9, 12, "#d8c89d");
  rect(c, 19, 12, 7, 9, "#baae87");
  rect(c, 10, 11, 2, 2, "#714c35");
  rect(c, 21, 11, 2, 2, "#714c35");
  for (let y = 15; y < 23; y += 3) rect(c, 9, y, 5, 1, "#9c8b65");
  rect(c, 20, 15, 5, 1, "#817554");
  rect(c, 20, 18, 3, 1, "#817554");
  poly(
    c,
    [
      [1, 8],
      [5, 4],
      [28, 4],
      [33, 8],
    ],
    "#776142",
  );
}

function bed(c: Ctx, x: number, y: number, cover: string) {
  rect(c, x + 4, y + 7, 39, 58, "#5b4a3555");
  rect(c, x, y, 38, 57, "#71553a");
  rect(c, x + 2, y + 4, 34, 48, "#c6b78c");
  rect(c, x + 3, y + 19, 32, 32, cover);
  rect(c, x + 3, y + 19, 32, 3, shade(cover, 22));
  rect(c, x + 9, y + 6, 22, 11, "#e0d1ac");
  rect(c, x + 9, y + 14, 22, 3, "#c4b994");
  rect(c, x + 3, y + 1, 32, 4, "#a38355");
  rect(c, x + 2, y + 51, 34, 5, "#a38355");
  rect(c, x, y - 2, 4, 11, "#98764c");
  rect(c, x + 34, y - 2, 4, 11, "#98764c");
  rect(c, x + 1, y + 54, 3, 7, "#5e4833");
  rect(c, x + 34, y + 54, 3, 7, "#5e4833");
  for (let i = 0; i < 3; i++) {
    rect(c, x + 9 + i * 8, y + 25, 3, 21, shade(cover, 9));
    rect(c, x + 10 + i * 8, y + 25, 1, 21, shade(cover, 23));
  }
}
function rug(c: Ctx, x: number, y: number, w: number, h: number, main: string) {
  rect(c, x - 2, y - 2, w + 4, h + 4, "#644c37");
  rect(c, x, y, w, h, main);
  rect(c, x + 3, y + 3, w - 6, h - 6, "#bc9b6c");
  rect(c, x + 5, y + 5, w - 10, h - 10, main);
  for (let px = x + 12; px < x + w - 8; px += 14) {
    poly(
      c,
      [
        [px, y + 8],
        [px + 3, y + 11],
        [px, y + 14],
        [px - 3, y + 11],
      ],
      "#d1b07a",
    );
    poly(
      c,
      [
        [px, y + h - 14],
        [px + 3, y + h - 11],
        [px, y + h - 8],
        [px - 3, y + h - 11],
      ],
      "#d1b07a",
    );
  }
  for (let py = y + 22; py < y + h - 15; py += 21)
    for (let px = x + 20; px < x + w - 12; px += 24) {
      rect(c, px, py, 1, 5, "#c8a778");
      rect(c, px - 2, py + 2, 5, 1, "#c8a778");
    }
  for (let px = x; px < x + w; px += 3) {
    rect(c, px, y - 4, 1, 2, "#c2ad80");
    rect(c, px, y + h + 2, 1, 2, "#c2ad80");
  }
}
function interiorWindow(c: Ctx, x: number, y: number) {
  rect(c, x - 4, y - 4, 40, 44, "#776047");
  rect(c, x - 2, y - 2, 36, 40, "#b29b70");
  rect(c, x, y, 32, 33, "#8fa79e");
  rect(c, x + 1, y + 1, 30, 15, "#b8c6b0");
  poly(
    c,
    [
      [x, y + 22],
      [x + 8, y + 13],
      [x + 17, y + 19],
      [x + 26, y + 14],
      [x + 32, y + 20],
      [x + 32, y + 33],
      [x, y + 33],
    ],
    "#72896c",
  );
  rect(c, x + 15, y, 2, 33, "#725e44");
  rect(c, x, y + 17, 32, 2, "#725e44");
  rect(c, x - 6, y + 34, 44, 4, "#d5c197");
  // Dusty linen curtains, drawn in stepped folds.
  rect(c, x - 5, y - 1, 9, 31, "#c8baa1");
  rect(c, x + 29, y - 1, 9, 31, "#c8baa1");
  rect(c, x - 2, y, 2, 26, "#e2d2b1");
  rect(c, x + 33, y, 2, 26, "#e2d2b1");
  rect(c, x - 5, y + 22, 9, 2, "#9b7855");
  rect(c, x + 29, y + 22, 9, 2, "#9b7855");
}

function paintOrphanage(c: Ctx) {
  const random = rng(27174);
  rect(c, 0, 0, 450, 450, "#323b31");
  rect(c, 20, 19, 410, 410, "#68543d");
  c.save();
  c.beginPath();
  c.rect(26, 81, 398, 337);
  c.clip();
  for (let y = 81; y < 418; y += 10) {
    rect(c, 26, y, 398, 9, y % 30 ? "#9a7c54" : "#a38559");
    rect(c, 26, y + 8, 398, 1, "#735b3c");
    for (let x = 25 + (y % 40) * 3; x < 425; x += 59) {
      rect(c, x, y, 1, 9, "#735b3c");
      if (random() > 0.35) {
        rect(c, x + 17, y + 3, 11, 1, "#b49668");
        rect(c, x + 29, y + 5, 7, 1, "#806644");
      }
    }
  }
  c.restore();
  rect(c, 21, 19, 408, 64, "#b5a688");
  rect(c, 21, 20, 408, 3, "#d2be94");
  rect(c, 21, 75, 408, 8, "#69543b");
  rect(c, 24, 75, 402, 2, "#9e7d53");
  [23, 133, 310, 423].forEach((x) => {
    rect(c, x, 20, 5, 61, "#66513b");
    rect(c, x + 1, 20, 1, 59, "#92704b");
  });
  interiorWindow(c, 62, 31);
  interiorWindow(c, 346, 31);
  // A welcoming hearth and mantel at the north wall.
  stones(c, 189, 27, 60, 49, 803);
  rect(c, 199, 40, 40, 30, "#4b4538");
  rect(c, 204, 44, 30, 27, "#393831");
  rect(c, 208, 59, 22, 9, "#ba6439");
  rect(c, 212, 56, 5, 12, "#dc9850");
  rect(c, 222, 58, 4, 10, "#dc9850");
  rect(c, 216, 62, 8, 6, "#f0cf77");
  rect(c, 186, 32, 66, 4, "#735b3b");
  rect(c, 188, 31, 62, 1, "#b19360");
  rect(c, 187, 76, 67, 9, "#92856b");
  rect(c, 183, 85, 75, 5, "#ae9e7b");
  rect(c, 193, 22, 7, 9, "#c5b48a");
  rect(c, 240, 24, 7, 7, "#96644a");
  // A tiny mantle clock.
  rect(c, 213, 14, 13, 17, "#71553a");
  rect(c, 215, 16, 9, 9, "#d1bd8c");
  rect(c, 219, 18, 1, 4, "#615439");
  rect(c, 219, 21, 3, 1, "#615439");
  bed(c, 48, 129, "#788b74");
  bed(c, 48, 247, "#a46c55");
  bed(c, 361, 129, "#a98858");
  bed(c, 361, 247, "#728c87");
  // Low cupboards, folded blankets, and toys at the foot of each bed.
  for (const [x, y] of [
    [91, 137],
    [91, 257],
    [331, 137],
    [331, 257],
  ]) {
    rect(c, x, y, 23, 23, "#715638");
    rect(c, x + 1, y - 2, 22, 4, "#ba9762");
    rect(c, x + 3, y + 6, 18, 1, "#9b7647");
    rect(c, x + 11, y + 9, 2, 2, "#d1b574");
    rect(c, x + 5, y - 8, 7, 6, "#c5b58b");
    rect(c, x + 7, y - 12, 3, 4, "#e0d0a1");
  }
  rug(c, 149, 150, 145, 181, "#91634e");
  // A small carved flower in the centre of the family rug.
  poly(
    c,
    [
      [221, 214],
      [235, 240],
      [221, 267],
      [207, 240],
    ],
    "#cba36c",
  );
  poly(
    c,
    [
      [221, 222],
      [231, 240],
      [221, 259],
      [211, 240],
    ],
    "#67785e",
  );
  rect(c, 221, 232, 1, 18, "#dcc391");
  rect(c, 214, 240, 15, 1, "#dcc391");
  // Bookcase and a quiet corner table, clear of the player's arrival point.
  rect(c, 33, 335, 71, 42, "#614c34");
  rect(c, 35, 336, 67, 4, "#aa8355");
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 14; i++) {
      const x = 38 + i * 4,
        y = 342 + row * 16;
      rect(
        c,
        x,
        y,
        3,
        12 - (i % 3),
        ["#97674d", "#6b8573", "#b39b6d", "#68787d"][i % 4],
      );
      rect(c, x, y + 2, 3, 1, "#c6b58b");
    }
  rect(c, 34, 354, 68, 2, "#aa8355");
  rect(c, 33, 375, 71, 3, "#a88251");
  ellipse(c, 353, 368, 34, 10, "#584c3655");
  rect(c, 329, 333, 48, 25, "#7b5d3e");
  rect(c, 326, 330, 54, 25, "#b48d58");
  rect(c, 329, 331, 47, 1, "#d0ae73");
  rect(c, 332, 355, 4, 13, "#604b34");
  rect(c, 368, 355, 4, 13, "#604b34");
  rect(c, 343, 335, 20, 12, "#d7c59b");
  rect(c, 352, 335, 1, 12, "#9e8f69");
  rect(c, 346, 338, 4, 1, "#a99b75");
  rect(c, 355, 338, 5, 1, "#a99b75");
  ellipse(c, 333, 343, 3, 3, "#d1c09b");
  rect(c, 372, 337, 3, 6, "#d7bb7c");
  rect(c, 373, 333, 1, 3, "#dba261");
  // Children's carved horse, blocks, and a soft ball.
  rect(c, 120, 287, 11, 7, "#b99262");
  rect(c, 120, 294, 2, 4, "#8b6947");
  rect(c, 129, 294, 2, 4, "#8b6947");
  rect(c, 128, 281, 4, 9, "#b99262");
  rect(c, 128, 280, 6, 4, "#b99262");
  rect(c, 305, 190, 6, 6, "#ab7254");
  rect(c, 310, 194, 6, 6, "#baa86d");
  rect(c, 304, 197, 5, 5, "#738778");
  ellipse(c, 119, 201, 5, 5, "#9e7254");
  rect(c, 118, 197, 2, 8, "#d4b47d");
  // Potted herbs bring a little garden indoors.
  for (const [x, y] of [
    [34, 103],
    [414, 104],
    [119, 361],
    [404, 377],
  ]) {
    rect(c, x - 5, y, 10, 9, "#ab7754");
    rect(c, x - 6, y, 12, 2, "#c89767");
    bush(c, x, y - 2, x);
  }
  rect(c, 20, 83, 6, 345, "#675439");
  rect(c, 424, 83, 6, 345, "#675439");
  rect(c, 20, 421, 410, 9, "#564932");
  rect(c, 26, 418, 398, 3, "#b19665");
  // The threshold corresponds to the functional exit at (450,790).
  rect(c, 203, 395, 43, 32, "#514836");
  rect(c, 207, 397, 35, 27, "#7c6140");
  for (let x = 209; x < 241; x += 5) rect(c, x, 398, 1, 25, "#9c7b4c");
  rect(c, 202, 424, 45, 3, "#ccb386");
  rug(c, 203, 370, 43, 18, "#69755a");
}

function paintDungeon(c: Ctx) {
  const random = rng(143332);
  rect(c, 0, 0, 450, 450, "#253330");
  rect(c, 28, 32, 394, 386, "#4a554b");
  for (let y = 36; y < 416; y += 14)
    for (let x = 30 - (y % 28 ? 0 : 15); x < 421; x += 30) {
      const sx = Math.max(30, x),
        ex = Math.min(x + 28, 420);
      rect(
        c,
        sx,
        y,
        ex - sx,
        12,
        ["#5b6457", "#626a5a", "#515e54", "#69705e"][Math.floor(random() * 4)],
      );
      rect(c, sx + 1, y, ex - sx - 2, 1, "#7a7c65");
      if (random() > 0.72) {
        rect(c, sx + 4, y + 8, 9, 1, "#465349");
        rect(c, sx + 12, y + 6, 1, 3, "#465349");
      }
    }
  stones(c, 17, 15, 416, 31, 624);
  rect(c, 20, 42, 410, 4, "#858a72");
  stones(c, 17, 46, 15, 375, 972);
  stones(c, 419, 46, 15, 375, 743);
  stones(c, 17, 419, 416, 15, 644);
  // Ancient columns stay along the walls, leaving combat routes open.
  for (const [x, y] of [
    [50, 63],
    [374, 63],
    [50, 340],
    [374, 340],
  ]) {
    ellipse(c, x + 14, y + 45, 18, 7, "#283c3377");
    stones(c, x + 4, y + 2, 18, 33, x + y);
    rect(c, x, y, 27, 6, "#8b9077");
    rect(c, x + 1, y + 34, 25, 6, "#8b9077");
    rect(c, x + 6, y + 6, 2, 26, "#a5a58a");
    rect(c, x + 18, y + 6, 2, 26, "#4b5b4e");
  }
  // A worn altar, seals, roots, and pockets of luminous moss.
  rect(c, 175, 62, 100, 20, "#455045");
  stones(c, 178, 53, 94, 23, 414);
  rect(c, 171, 49, 108, 6, "#9a9c81");
  rect(c, 173, 49, 104, 1, "#b9b493");
  rect(c, 210, 34, 30, 14, "#5b6251");
  rect(c, 221, 34, 7, 14, "#9da085");
  rect(c, 210, 40, 30, 3, "#9da085");
  for (let i = 0; i < 95; i++) {
    const side = i % 2 === 0,
      x = side ? 33 + random() * 55 : 370 + random() * 43,
      y = 66 + random() * 330;
    rect(c, x, y, 3 + random() * 7, 2, "#586f50");
    if (i % 5 === 0) rect(c, x, y - 1, 2, 1, "#97a477");
  }
  for (const points of [
    [
      [30, 46],
      [44, 76],
      [32, 109],
      [53, 135],
    ],
    [
      [423, 170],
      [401, 193],
      [418, 221],
      [394, 246],
    ],
    [
      [110, 20],
      [135, 43],
      [158, 45],
      [171, 77],
    ],
  ]) {
    line(c, points, 4, "#4d5038");
    line(
      c,
      points.map(([x, y]) => [x - 1, y]),
      1,
      "#7c7b50",
    );
  }
  for (const [x, y] of [
    [104, 103],
    [344, 103],
    [101, 311],
    [345, 313],
  ]) {
    ellipse(c, x, y + 7, 18, 8, "#a8a05a14");
    ellipse(c, x, y + 3, 12, 5, "#b7ae6319");
    rect(c, x - 3, y, 6, 14, "#625c45");
    rect(c, x - 5, y - 3, 10, 6, "#7e7958");
    rect(c, x - 3, y - 9, 7, 8, "#bb9555");
    rect(c, x - 1, y - 12, 3, 10, "#d0bd79");
  }
  for (let i = 0; i < 27; i++) {
    const x = 70 + random() * 306,
      y = 90 + random() * 290;
    if (i % 3 === 0) {
      rect(c, x, y, 8, 2, "#a2a38a");
      rect(c, x - 1, y - 1, 2, 4, "#a2a38a");
      rect(c, x + 7, y - 1, 2, 4, "#a2a38a");
    } else {
      rect(c, x, y, 4, 3, "#3e5146");
      rect(c, x + 1, y, 3, 1, "#778269");
    }
  }
  rect(c, 200, 411, 50, 22, "#263b32");
  rect(c, 205, 413, 40, 5, "#8b9077");
  rect(c, 210, 419, 30, 4, "#6e7b66");
  rect(c, 213, 424, 24, 3, "#556957");
}

const namedColors: Record<string, string> = {
  clara: "#e2b48e",
  claro: "#e2b48e",
  light: "#e2b48e",
  fair: "#e2b48e",
  media: "#b88964",
  medium: "#b88964",
  bronze: "#b88964",
  morena: "#b88964",
  escura: "#79553e",
  dark: "#79553e",
  ebony: "#79553e",
  castanho: "#684633",
  brown: "#684633",
  black: "#373932",
  preto: "#373932",
  loiro: "#bc995d",
  blonde: "#bc995d",
  ruivo: "#a46440",
  red: "#a46440",
  grisalho: "#bcb9a4",
  gray: "#bcb9a4",
  white: "#dbd5be",
  branco: "#dbd5be",
  verde: "#65785d",
  green: "#65785d",
  azul: "#5e7f88",
  blue: "#5e7f88",
  vinho: "#8b5b54",
  burgundy: "#8b5b54",
  marrom: "#92774e",
  cream: "#c7b791",
};
function color(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : namedColors[value.toLowerCase()] || fallback;
}

export function createCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  appearance: Appearance,
  kind = "apostle",
): void {
  const skin = color(appearance.skin, "#cda07b"),
    hair = color(appearance.hair, "#654937");
  const outfit = color(appearance.outfit, "#647a69"),
    eyes = color(appearance.eyes, "#35453c");
  texture(scene, key, 32, 48, (c) => {
    const matron = kind === "matron",
      smith = kind === "aldric" || kind === "smith";
    const headHair = matron ? "#bbb9a4" : hair;
    // Boots and individual trouser legs establish a readable full silhouette.
    rect(c, 5, 18, 3, 5, "#514d3c");
    rect(c, 9, 18, 3, 5, "#514d3c");
    rect(c, 4, 22, 4, 2, "#3b3e31");
    rect(c, 9, 22, 4, 2, "#3b3e31");
    rect(c, 5, 22, 2, 1, "#746347");
    rect(c, 10, 22, 2, 1, "#746347");
    // Linen shirt, tunic, shoulder seams, and a leather belt.
    rect(c, 4, 10, 9, 8, shade(outfit, -32));
    rect(c, 5, 10, 7, 9, outfit);
    rect(c, 3, 11, 3, 5, outfit);
    rect(c, 11, 11, 3, 5, shade(outfit, -13));
    rect(c, 3, 16, 2, 3, shade(skin, -13));
    rect(c, 12, 16, 2, 3, skin);
    rect(c, 6, 10, 2, 2, "#cbb58d");
    rect(c, 9, 10, 2, 2, "#cbb58d");
    rect(c, 5, 17, 7, 2, "#5e4a34");
    rect(c, 8, 17, 2, 2, "#cfb16d");
    rect(c, 6, 12, 1, 4, shade(outfit, 26));
    rect(c, 10, 12, 1, 4, shade(outfit, -15));
    rect(c, 8, 12, 1, 1, "#c7b585");
    rect(c, 8, 15, 1, 1, "#c7b585");
    if (matron) {
      rect(c, 6, 12, 5, 8, "#d0c2a0");
      rect(c, 7, 12, 3, 1, "#e2d8b8");
      rect(c, 5, 19, 7, 2, "#d0c2a0");
    }
    if (smith) {
      rect(c, 6, 12, 5, 7, "#776045");
      rect(c, 6, 18, 5, 1, "#9d8059");
    }
    // A warm side-lit face with two discrete eye pixels and a hair parting.
    rect(c, 5, 3, 7, 7, shade(skin, -18));
    rect(c, 6, 3, 6, 6, skin);
    rect(c, 4, 5, 1, 3, shade(skin, -13));
    rect(c, 12, 5, 1, 3, skin);
    rect(c, 7, 9, 3, 2, skin);
    rect(c, 6, 3, 5, 1, shade(skin, 17));
    rect(c, 6, 6, 1, 1, eyes);
    rect(c, 10, 6, 1, 1, eyes);
    rect(c, 8, 7, 1, 1, shade(skin, -22));
    rect(c, 8, 9, 2, 1, shade(skin, -30));
    rect(c, 5, 2, 7, 3, headHair);
    rect(c, 6, 1, 5, 2, headHair);
    rect(c, 5, 4, 1, 3, headHair);
    rect(c, 11, 3, 1, 2, headHair);
    rect(c, 6, 2, 3, 1, shade(headHair, 30));
    rect(c, 10, 2, 1, 2, shade(headHair, -18));
    if (matron) {
      rect(c, 4, 2, 2, 3, "#d5ceb7");
      rect(c, 11, 2, 2, 3, "#d5ceb7");
    }
    if (smith) {
      rect(c, 6, 8, 1, 2, hair);
      rect(c, 7, 9, 4, 1, hair);
      rect(c, 11, 8, 1, 2, hair);
    }
  });
}

function paintEnemy(c: Ctx) {
  const random = rng(955);
  rect(c, 8, 21, 3, 10, "#53604a");
  rect(c, 15, 21, 3, 10, "#53604a");
  rect(c, 6, 29, 5, 2, "#303f32");
  rect(c, 15, 29, 5, 2, "#303f32");
  poly(
    c,
    [
      [7, 10],
      [18, 10],
      [20, 25],
      [5, 25],
    ],
    "#435640",
  );
  rect(c, 9, 10, 8, 15, "#637052");
  rect(c, 11, 13, 1, 9, "#829072");
  rect(c, 7, 19, 12, 2, "#3d4432");
  rect(c, 12, 19, 3, 2, "#9d9b66");
  rect(c, 4, 12, 4, 12, "#56624a");
  rect(c, 18, 12, 3, 11, "#46563e");
  rect(c, 3, 22, 4, 3, "#a6a68b");
  rect(c, 20, 22, 3, 3, "#a6a68b");
  poly(
    c,
    [
      [7, 3],
      [11, 1],
      [16, 2],
      [19, 6],
      [19, 13],
      [6, 13],
    ],
    "#354a37",
  );
  rect(c, 8, 5, 9, 7, "#b9b89a");
  rect(c, 9, 4, 7, 2, "#cfccb0");
  rect(c, 9, 7, 2, 2, "#3d4938");
  rect(c, 14, 7, 2, 2, "#3d4938");
  rect(c, 9, 7, 1, 1, "#c6d19c");
  rect(c, 14, 7, 1, 1, "#c6d19c");
  rect(c, 12, 9, 1, 1, "#586049");
  rect(c, 10, 11, 5, 1, "#747e60");
  for (let i = 0; i < 13; i++)
    rect(c, 5 + random() * 15, 13 + random() * 10, 2, 1, "#819360");
  rect(c, 21, 12, 1, 16, "#785f3e");
  rect(c, 18, 11, 7, 3, "#9e9e85");
  rect(c, 23, 9, 2, 6, "#697b68");
}

export function generateArt(scene: Phaser.Scene): void {
  texture(scene, "village-ground", WORLD_W, WORLD_H, paintGround);
  texture(scene, "orphanage-ground", 900, 900, paintOrphanage);
  texture(scene, "dungeon-ground", 900, 900, paintDungeon);
  texture(scene, "house-orphanage", 220, 176, (c) =>
    house(c, 110, 88, "orphanage"),
  );
  texture(scene, "house-inn", 208, 164, (c) => house(c, 104, 82, "inn"));
  texture(scene, "house-house1", 180, 144, (c) => house(c, 90, 72, "cottage"));
  texture(scene, "property-house", 160, 140, (c) =>
    house(c, 80, 70, "cottage"),
  );
  texture(scene, "forge", 180, 140, paintForge);
  texture(scene, "mill", 190, 170, paintMill);
  texture(scene, "mill-sails", 140, 140, paintMillSails);
  texture(scene, "bakery", 175, 140, paintBakery);
  texture(scene, "market", 174, 120, paintMarket);
  texture(scene, "farm", 260, 210, (c) => paintFarmFloor(c));
  texture(scene, "farm-growing", 260, 210, (c) => paintFarmFloor(c, true, false));
  texture(scene, "farm-empty", 260, 210, (c) => paintFarmFloor(c, false));
  texture(scene, "farm-shed", 260, 210, paintFarmShed);
  texture(scene, "farm-fence-back", 260, 210, (c) => paintFarmFence(c, false));
  texture(scene, "farm-fence-front", 260, 210, (c) => paintFarmFence(c, true));
  texture(scene, "farm-fence-side", 8, 24, paintFarmSideFence);
  texture(scene, "well", 96, 84, paintWell);
  texture(scene, "crypt", 174, 140, paintCrypt);
  texture(scene, "sign", 68, 80, paintSign);
  texture(scene, "tree1", 118, 146, (c) => paintTree(c, 1));
  texture(scene, "tree2", 118, 146, (c) => paintTree(c, 2));
  texture(scene, "pine", 90, 166, (c) => paintTree(c, 3, true));
  texture(scene, "rock", 64, 48, (c) => {
    ellipse(c, 17, 21, 14, 3, "#3e55393f");
    poly(
      c,
      [
        [3, 18],
        [6, 10],
        [15, 4],
        [26, 9],
        [30, 19],
        [23, 22],
        [8, 22],
      ],
      "#687768",
    );
    poly(
      c,
      [
        [6, 10],
        [15, 4],
        [26, 9],
        [20, 15],
        [8, 16],
      ],
      "#9d9f87",
    );
    poly(
      c,
      [
        [15, 4],
        [19, 10],
        [14, 15],
        [8, 16],
        [6, 10],
      ],
      "#b6b59b",
    );
    rect(c, 19, 16, 6, 2, "#51674e");
    rect(c, 8, 20, 7, 2, "#7c8b58");
  });
  texture(scene, "herb", 48, 48, (c) => {
    ellipse(c, 12, 21, 10, 2, "#3b583a39");
    for (let i = 0; i < 5; i++) {
      const x = 5 + i * 3,
        y = 5 + (i % 3) * 3;
      rect(c, x, y, 1, 16 - y, "#526e40");
      rect(c, x - 2, y + 7, 3, 2, "#719056");
      rect(c, x + 1, y + 5, 3, 2, "#96a467");
      rect(c, x - 1, y, 3, 4, "#9890ac");
      rect(c, x, y, 1, 2, "#cbc3ce");
    }
    bush(c, 12, 18, 611);
    rect(c, 7, 8, 2, 3, "#a697b4");
    rect(c, 16, 9, 2, 3, "#b9a9c3");
  });
  texture(scene, "enemy", 48, 64, paintEnemy);
  texture(scene, "bush", 48, 34, (c) => bush(c, 12, 11, 936));
}

export function drawLandscape(scene: Phaser.Scene) {
  generateArt(scene);
  return {
    background: "village-ground",
    foregroundObjects: villageDecor,
    width: WORLD_W,
    height: WORLD_H,
  };
}

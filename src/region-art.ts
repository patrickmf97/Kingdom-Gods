import type Phaser from "phaser";
import { regionForZone, WILDERNESS_ROADS } from "./regions";
import type { Zone } from "./types";

type Context = CanvasRenderingContext2D;
type Rectangle = { left: number; top: number; right: number; bottom: number };
const randomFor = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const box = (c: Context, x: number, y: number, width: number, height: number, color: string) => {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
};
function polygon(c: Context, points: number[][], color: string) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(Math.round(x), Math.round(y)) : c.moveTo(Math.round(x), Math.round(y)));
  c.closePath();
  c.fill();
}
function oval(c: Context, x: number, y: number, width: number, height: number, color: string) {
  c.fillStyle = color;
  for (let at = -Math.ceil(height); at <= height; at++) {
    const span = Math.round(width * Math.sqrt(Math.max(0, 1 - at * at / (height * height))));
    c.fillRect(Math.round(x - span), Math.round(y + at), span * 2 + 1, 1);
  }
}
function route(c: Context, points: number[][], width: number, color: string) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x / 2, y / 2) : c.moveTo(x / 2, y / 2));
  c.stroke();
}
function texture(scene: Phaser.Scene, key: string, width: number, height: number, paint: (c: Context) => void) {
  if (scene.textures.exists(key)) return;
  const small = document.createElement("canvas");
  small.width = Math.ceil(width / 2);
  small.height = Math.ceil(height / 2);
  const context = small.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  paint(context);
  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  const fullContext = full.getContext("2d")!;
  fullContext.imageSmoothingEnabled = false;
  fullContext.drawImage(small, 0, 0, width, height);
  scene.textures.addCanvas(key, full);
}

function paintWilderness(c: Context) {
  const region = regionForZone("wilderness"), random = randomFor(411019);
  const width = region.width / 2, height = region.height / 2;
  box(c, 0, 0, width, height, "#7c9065");
  for (let i = 0; i < 280; i++) {
    oval(c, random() * width, random() * height, 25 + random() * 70, 14 + random() * 40,
      i % 4 ? "#84986b" : "#71875d");
  }
  // Road and shoulders are ground layers; their entire width is traversable.
  for (const road of WILDERNESS_ROADS) {
    const points = road.map(({ x, y }) => [x, y]);
    route(c, points, 39, "#a69973");
    route(c, points, 34, "#b6a985");
    route(c, points, 28, "#c5b691");
  }
  // The lake matches the solid water footprint, with a dry, walkable shore.
  box(c, 1135, 705, 190, 120, "#c5b99a");
  box(c, 1140, 715, 180, 100, "#547e7c");
  box(c, 1143, 718, 174, 94, "#628d87");
  for (let row = 0; row < 18; row++) {
    const x = 1150 + random() * 150, y = 722 + row * 5;
    box(c, x, y, 7 + random() * 14, 1, row % 3 ? "#739c94" : "#89b0a4");
  }
  for (let i = 0; i < 4000; i++) {
    const x = random() * width, y = random() * height;
    if (x >= 1135 && x <= 1325 && y >= 705 && y <= 825) continue;
    box(c, x, y, i % 5 ? 2 : 1, 1, ["#93a577", "#6b8259", "#a2ac7f"][i % 3]);
    if (i % 71 === 0) {
      box(c, x, y - 2, 1, 3, "#536f45");
      box(c, x - 1, y - 3, 3, 1, i % 2 ? "#dfceb0" : "#bca9b0");
    }
  }
  // Northern bedrock is scenery beyond the traversable map boundary.
  for (let x = 0; x < width; x += 40) {
    polygon(c, [[x, 0], [x + 50, 0], [x + 42, 34], [x + 12, 45]], "#636e60");
    polygon(c, [[x + 3, 0], [x + 43, 0], [x + 32, 20], [x + 14, 31]], "#86907a");
  }
  oval(c, 550, 725, 75, 38, "#b2a07a");
  oval(c, 850, 500, 66, 38, "#879176");
  // Stone floor beneath the ruined arch remains visible and freely accessible.
  for (let y = 448; y < 478; y += 6) {
    for (let x = 820; x < 886; x += 11) box(c, x, y, 10, 5, y % 12 ? "#989880" : "#a6a58c");
  }
}

function paintMine(c: Context) {
  const region = regionForZone("mine"), width = region.width / 2, height = region.height / 2;
  const areas = region.walkableAreas || [], random = randomFor(901132);
  box(c, 0, 0, width, height, "#28322f");
  for (let y = 0; y < height; y += 18) {
    for (let x = -((y / 18) % 2) * 17; x < width; x += 34) {
      polygon(c, [[x, y + 2], [x + 17, y - 3], [x + 32, y + 3], [x + 36, y + 15],
        [x + 14, y + 21], [x - 2, y + 14]],
        ["#36413a", "#3b473e", "#313b36"][Math.floor(random() * 3)]);
      polygon(c, [[x, y + 2], [x + 17, y - 3], [x + 32, y + 3], [x + 15, y + 6]], "#4a5143");
    }
  }
  // Use exactly the same authored rectangle union as navigation. Every dark
  // boundary is solid; every illuminated floor belongs to a connected chamber.
  const floor = document.createElement("canvas");
  floor.width = width;
  floor.height = height;
  const f = floor.getContext("2d")!;
  for (const area of areas) {
    const { left, top, right, bottom } = area as Rectangle;
    box(f, left / 2, top / 2, (right - left) / 2, (bottom - top) / 2, "#77765e");
  }
  const mask = f.getImageData(0, 0, width, height).data;
  f.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 3200; i++) {
    const x = random() * width, y = random() * height;
    box(f, x, y, 1 + random() * 4, 1, ["#817e65", "#6d6e59", "#938970"][i % 3]);
  }
  const torches: { x: number; y: number }[] = [];
  // Upper rock faces cast a short shadow onto the chamber floors, while the
  // ledge itself is painted outside their collision boundary.
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[(y * width + x) * 4 + 3] > 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!inside(x, y) || inside(x, y - 1)) continue;
      box(c, x, y - 11, 1, 11, "#515a48");
      box(c, x, y - 11, 1, 2, "#7a8065");
      box(f, x, y, 1, 6, "#5d634f");
      box(f, x, y + 6, 1, 2, "#676c55");
      if (x % 86 === 40 && inside(x - 12, y) && inside(x + 12, y)) {
        torches.push({ x, y: y - 2 });
        oval(f, x, y + 7, 15, 10, "#ac945f25");
      }
    }
  }
  c.drawImage(floor, 0, 0);
  for (const area of areas) {
    const centerX = (area.left + area.right) / 4, centerY = (area.top + area.bottom) / 4;
    oval(c, centerX, centerY, Math.min(22, (area.right - area.left) / 9), 8, "#85816a30");
  }
  // Rails and a few timbers document the working mine, rather than implying
  // monsters or compulsory combat. Rails are flat, traversable ground details.
  for (const x of [195, 205]) {
    box(c, x, 340, 2, 148, "#4d5145");
    box(c, x, 340, 1, 148, "#a7a48c");
  }
  for (let y = 343; y < 488; y += 12) box(c, 191, y, 20, 3, "#60553e");
  for (const { x: px, y: py } of torches) {
    box(c, px - 2, py - 8, 4, 9, "#4c3d2d");
    box(c, px - 2, py - 10, 4, 2, "#a2814a");
    oval(c, px, py - 11, 2, 4, "#dda458");
    box(c, px, py - 13, 1, 3, "#fae3a0");
  }
}

function paintCave(c: Context) {
  oval(c, 55, 80, 48, 8, "#3a443540");
  polygon(c, [[14, 77], [15, 31], [33, 9], [64, 6], [93, 32], [96, 77]], "#566251");
  polygon(c, [[16, 53], [17, 31], [33, 9], [67, 8], [93, 32], [77, 43]], "#91927a");
  polygon(c, [[17, 31], [37, 11], [41, 37], [24, 48]], "#aba68b");
  box(c, 30, 43, 51, 34, "#2b3730");
  polygon(c, [[34, 77], [40, 43], [51, 34], [67, 39], [77, 77]], "#172b29");
  box(c, 29, 42, 4, 35, "#6b543b");
  box(c, 78, 42, 4, 35, "#6b543b");
  box(c, 27, 40, 57, 4, "#9c8054");
  box(c, 51, 65, 2, 17, "#766e53");
  box(c, 62, 65, 2, 17, "#766e53");
  for (let y = 66; y <= 82; y += 5) box(c, 48, y, 18, 2, "#574733");
  oval(c, 19, 78, 6, 4, "#46583c");
  oval(c, 90, 78, 8, 5, "#63784b");
}
function paintCamp(c: Context) {
  oval(c, 55, 67, 55, 9, "#44533545");
  polygon(c, [[23, 55], [29, 35], [44, 20], [47, 55]], "#b8a77b");
  polygon(c, [[44, 20], [59, 34], [63, 55], [47, 55]], "#81734f");
  polygon(c, [[29, 55], [37, 35], [43, 55]], "#3e4937");
  box(c, 22, 55, 42, 2, "#5c4d34");
  box(c, 22, 56, 2, 3, "#735e3e");
  box(c, 62, 56, 2, 3, "#735e3e");
  oval(c, 76, 64, 8, 4, "#716c55");
  oval(c, 76, 63, 5, 2, "#3b4231");
  box(c, 71, 61, 11, 2, "#805b39");
  oval(c, 76, 60, 2, 4, "#bd8851");
  box(c, 76, 58, 1, 3, "#e8c775");
  box(c, 10, 64, 14, 5, "#997347");
  box(c, 11, 65, 13, 1, "#c19b60");
}
function paintRuins(c: Context) {
  oval(c, 60, 86, 57, 10, "#48533d40");
  for (const x of [15, 95]) {
    box(c, x, 32, 10, 47, "#707563");
    for (let y = 33; y < 78; y += 6) {
      box(c, x, y, 9, 5, y % 12 ? "#9b9b82" : "#8b9078");
      box(c, x + 1, y, 7, 1, "#b2ad90");
    }
    box(c, x - 1, 77, 12, 2, "#5b6c4b");
  }
  box(c, 15, 32, 90, 11, "#7b806a");
  for (let x = 15; x < 103; x += 11) {
    box(c, x, 33, 10, 4, "#aaa388");
    box(c, x + 3, 38, 9, 4, "#8b9177");
  }
  box(c, 55, 32, 4, 5, "#596548");
  box(c, 22, 43, 2, 20, "#56764b");
  box(c, 20, 54, 4, 2, "#7e9560");
  polygon(c, [[40, 71], [42, 63], [49, 61], [56, 72]], "#999a7d");
  polygon(c, [[78, 73], [81, 67], [93, 70], [95, 75]], "#7c8b68");
}
function paintOre(c: Context, exhausted = false) {
  oval(c, 18, 24, 17, 4, "#21322c40");
  polygon(c, [[2, 21], [6, 9], [16, 2], [30, 7], [35, 21], [27, 25], [9, 25]], exhausted ? "#535c51" : "#626a5b");
  polygon(c, [[6, 9], [16, 2], [30, 7], [21, 15], [9, 16]], exhausted ? "#787b63" : "#95987d");
  polygon(c, [[16, 2], [21, 7], [16, 13], [9, 16], [6, 9]], exhausted ? "#888772" : "#b4ad8e");
  if (!exhausted) {
    for (const [x, y] of [[15, 10], [23, 14], [9, 19], [29, 19]]) {
      box(c, x, y, 4, 3, "#987649");
      box(c, x, y, 2, 1, "#e1c17f");
    }
    box(c, 24, 12, 1, 2, "#e5d5a0");
  }
}
function paintPortal(c: Context, underground = false) {
  if (underground) {
    box(c, 17, 4, 26, 31, "#342e24");
    box(c, 21, 9, 18, 24, "#c5b082");
    box(c, 17, 3, 4, 36, "#8c704a");
    box(c, 39, 3, 4, 36, "#8c704a");
    box(c, 17, 3, 27, 4, "#ad8a56");
    for (let y = 29; y < 42; y += 4) box(c, 15, y, 32, 3, "#969178");
    return;
  }
  oval(c, 30, 39, 21, 4, "#46563635");
  box(c, 27, 8, 4, 31, "#6c573c");
  box(c, 27, 8, 1, 31, "#a58657");
  polygon(c, [[6, 9], [37, 9], [48, 15], [37, 21], [6, 21]], "#a88c61");
  box(c, 8, 10, 28, 1, "#cfb58c");
  box(c, 12, 14, 20, 2, "#514b34");
  box(c, 19, 25, 26, 8, "#8b764e");
  box(c, 24, 28, 12, 1, "#c6b182");
}

/** Texture canvases are generated once; only the active region is instantiated. */
export function generateRegionArt(scene: Phaser.Scene, zone: Zone) {
  if (zone !== "wilderness" && zone !== "mine") {
    texture(scene, "frontier-sign", 112, 88, (c) => paintPortal(c));
    return;
  }
  const region = regionForZone(zone);
  texture(scene, `${zone}-ground`, region.width, region.height, zone === "mine" ? paintMine : paintWilderness);
  texture(scene, "frontier-sign", 112, 88, (c) => paintPortal(c));
  texture(scene, "frontier-exit", 120, 90, (c) => paintPortal(c, true));
  texture(scene, "frontier-cave", 220, 180, paintCave);
  texture(scene, "frontier-camp", 220, 146, paintCamp);
  texture(scene, "frontier-ruins", 240, 200, paintRuins);
  texture(scene, "frontier-ore", 76, 56, (c) => paintOre(c));
  texture(scene, "frontier-ore-empty", 76, 56, (c) => paintOre(c, true));
}

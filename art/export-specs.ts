/** Writes the exact building footprints the Blender scripts model against (map pixels → metres). */
import { writeFileSync } from "node:fs";
import { regionForZone } from "../src/regions";
import { ESTATE_DEFS, estateSolid } from "../src/territory-data";

const S = 1 / 24;
const solids = regionForZone("village").solids;
type Spec = { id: string; kind: string; width: number; depth: number; height: number; roof: string };
const rect = (r: { left: number; right: number; top: number; bottom: number }) => ({ width: (r.right - r.left) * S, depth: (r.bottom - r.top) * S });
const specs: Spec[] = [
  { id: "orphanage", kind: "orphanage", ...rect(solids[0]), height: 3.8, roof: "tile" },
  { id: "inn", kind: "inn", ...rect(solids[1]), height: 3.45, roof: "tile-dark" },
  { id: "house", kind: "house", ...rect(solids[2]), height: 2.8, roof: "tile" },
  { id: "forge", kind: "forge", ...rect(solids[3]), height: 3.05, roof: "slate" },
  { id: "bakery", kind: "bakery", ...rect(solids[6]), height: 2.65, roof: "tile" },
  { id: "farm-shed", kind: "farm-shed", ...rect(solids[18]), height: 1.7, roof: "slate" },
  { id: "owned-home", kind: "owned-home", ...rect({ left: 2026, right: 2160, top: 718, bottom: 778 }), height: 2.7, roof: "tile" },
];
for (const estate of ESTATE_DEFS) {
  const r = rect(estateSolid(estate.id));
  specs.push({ id: `estate-${estate.id}`, kind: "estate-home", ...r, height: 2.6, roof: "tile" });
}
writeFileSync(new URL("./build/specs.json", import.meta.url), JSON.stringify(specs, null, 2));
console.log(specs.map(s => `${s.id}: ${s.width.toFixed(2)}×${s.depth.toFixed(2)}×${s.height}`).join("\n"));

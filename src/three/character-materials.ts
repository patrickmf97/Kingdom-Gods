import * as THREE from "three";

/** Original paint and micro-relief. Saved vertex colours supply each character's palette. */
export const CHARACTER_SURFACES = Object.freeze({
  cloth: 0, skin: 1, hair: 2, leather: 3, metal: 4, linen: 5, eye: 6, dark: 7,
});
export type CharacterSurface = keyof typeof CHARACTER_SURFACES;
const SIZE = 256, TILE_WIDTH = 64, TILE_HEIGHT = 128, GUTTER = 4;
const surfaces = Object.keys(CHARACTER_SURFACES) as CharacterSurface[];

/** Pixel-centred UVs stay inside the copied gutters, including at garment seams. */
export function characterUV(surface: CharacterSurface, u: number, v: number): [number, number] {
  const index = CHARACTER_SURFACES[surface];
  const unit = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : .5;
  return [
    (index % 4 * TILE_WIDTH + GUTTER + .5 + unit(u) * (TILE_WIDTH - GUTTER * 2 - 1)) / SIZE,
    (Math.floor(index / 4) * TILE_HEIGHT + GUTTER + .5 + unit(v) * (TILE_HEIGHT - GUTTER * 2 - 1)) / SIZE,
  ];
}

function grain(x: number, y: number): number {
  let n = Math.imul(x + 719, 374761393) ^ Math.imul(y + 317, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295 - .5;
}

function relief(surface: CharacterSurface, x: number, y: number): number {
  switch (surface) {
    case "cloth": return Math.sin(x * Math.PI / 2) * .19 + Math.sin(y * Math.PI / 3) * .16 + grain(x, y) * .035;
    case "skin": return Math.sin(x * .12) * Math.cos(y * .1) * .02 + grain(x, y) * .012;
    case "hair": return Math.sin(x * .65 + Math.sin(y * .035) * .25) * .28 + Math.sin(x * 1.8 + y * .03) * .07;
    case "leather": return Math.pow(Math.max(0, Math.sin(x * .11 + y * .13)), 12) * .21 + Math.sin(y * .045) * .08 + grain(x, y) * .07;
    case "metal": return Math.sin(y * 2.1) * .045 + grain(x, y) * .015;
    case "linen": return Math.sin(x * Math.PI / 2) * .25 + Math.sin(y * Math.PI * .4) * .23;
    case "eye": return 0;
    case "dark": return grain(x, y) * .12 + Math.sin((x + y) * .5) * .04;
  }
}

function tone(surface: CharacterSurface, x: number, y: number, height: number): number {
  const noise = grain(x, y);
  switch (surface) {
    case "cloth": return 245 + height * 9 + noise * 2;
    case "skin": return 251 + Math.sin(x * .13) * Math.cos(y * .09) * 1.5 + noise * 1.2;
    case "hair": return 243 + height * 14 + Math.sin(y * .02) * 1.2;
    case "leather": return 239 + height * 9 + noise * 5;
    case "metal": return 252 + height * 12 + Math.sin(y * .065) * .8 + noise * 2.2;
    case "linen": return 249 + height * 10;
    case "eye": return 255;
    case "dark": return 237 + height * 13 + noise * 3;
  }
}

const roughness: Record<CharacterSurface, number> = {
  cloth: 224, skin: 191, hair: 115, leather: 165, metal: 83, linen: 237, eye: 45, dark: 228,
};
type AtlasBytes = { albedo: Uint8Array; normal: Uint8Array; roughness: Uint8Array };
let template: AtlasBytes | undefined;

/** Generate once; every owner receives independent arrays and GPU texture objects. */
function atlasBytes(): AtlasBytes {
  if (template) return template;
  const data: AtlasBytes = { albedo: new Uint8Array(SIZE * SIZE * 4), normal: new Uint8Array(SIZE * SIZE * 4), roughness: new Uint8Array(SIZE * SIZE * 4) };
  for (const surface of surfaces) {
    const tile = CHARACTER_SURFACES[surface], ox = tile % 4 * TILE_WIDTH, oy = Math.floor(tile / 4) * TILE_HEIGHT;
    for (let y = GUTTER; y < TILE_HEIGHT - GUTTER; y++) for (let x = GUTTER; x < TILE_WIDTH - GUTTER; x++) {
      const offset = ((oy + y) * SIZE + ox + x) * 4, height = relief(surface, x, y);
      const value = Math.round(THREE.MathUtils.clamp(tone(surface, x, y, height), 210, 255));
      data.albedo.set([value, value, value, 255], offset);
      // Tangent normals are derived from the same woven/brushed relief as the paint.
      const dx = (relief(surface, x + 1, y) - relief(surface, x - 1, y)) * -.45;
      const dy = (relief(surface, x, y + 1) - relief(surface, x, y - 1)) * -.45;
      const length = Math.hypot(dx, dy, 1);
      data.normal.set([Math.round((dx / length * .5 + .5) * 255), Math.round((dy / length * .5 + .5) * 255), Math.round((1 / length * .5 + .5) * 255), 255], offset);
      const r = Math.round(THREE.MathUtils.clamp(roughness[surface] + height * 5 + grain(x, y) * 3, 30, 250));
      // StandardMaterial samples roughness from G; other channels remain neutral data.
      data.roughness.set([r, r, r, 255], offset);
    }
    // Clamp-copy each tile's own edge instead of filtering its neighbour's surface.
    for (const bytes of Object.values(data)) for (let y = 0; y < TILE_HEIGHT; y++) for (let x = 0; x < TILE_WIDTH; x++) {
      if (x >= GUTTER && x < TILE_WIDTH - GUTTER && y >= GUTTER && y < TILE_HEIGHT - GUTTER) continue;
      const sx = Math.max(GUTTER, Math.min(TILE_WIDTH - GUTTER - 1, x));
      const sy = Math.max(GUTTER, Math.min(TILE_HEIGHT - GUTTER - 1, y));
      const from = ((oy + sy) * SIZE + ox + sx) * 4, to = ((oy + y) * SIZE + ox + x) * 4;
      bytes.copyWithin(to, from, from + 4);
    }
  }
  template = data;
  return data;
}

export interface CharacterMaterials {
  material: THREE.MeshStandardMaterial;
  setLighting(daylight: number, indoors: boolean): void;
  dispose(): void;
}

const dayFillTint = new THREE.Color(.995, 1, 1.005);
const nightFillTint = new THREE.Color(.96, .985, 1.025);
const indoorFillTint = new THREE.Color(1, .985, .96);

/** One opaque material serves all articulated batches; no extra material draw groups. */
export function createCharacterMaterials(): CharacterMaterials {
  const bytes = atlasBytes();
  const texture = (kind: keyof AtlasBytes) => {
    const map = new THREE.DataTexture(bytes[kind].slice(), SIZE, SIZE, THREE.RGBAFormat);
    map.name = `character-${kind}-atlas`;
    map.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  };
  const albedo = texture("albedo"), normal = texture("normal"), rough = texture("roughness");
  const material = new THREE.MeshStandardMaterial({
    name: "tailored-character-surfaces", color: 0xffffff, vertexColors: true,
    map: albedo, normalMap: normal, normalScale: new THREE.Vector2(.2, .2),
    roughnessMap: rough, roughness: 1, metalness: .035, flatShading: false,
  });
  const fillStrength = { value: .025 }, fillTint = { value: dayFillTint.clone() };
  material.onBeforeCompile = shader => {
    shader.uniforms.uCharacterFillStrength = fillStrength;
    shader.uniforms.uCharacterFillTint = fillTint;
    if (shader.fragmentShader.includes("uniform float uCharacterFillStrength;")) return;
    shader.fragmentShader = `uniform float uCharacterFillStrength;\nuniform vec3 uCharacterFillTint;\n${shader.fragmentShader}`
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
        // Gentle reflected fill follows the actual normal, view and painted albedo.
        // It reveals the face at night without emissive light or a uniform white wash.
        float characterFillFacing = clamp(dot( normal, normalize(vViewPosition) ), 0.0, 1.0);
        float characterFillShape = (0.55 + 0.45 * sqrt(characterFillFacing))
          * (0.86 + 0.14 * smoothstep(-0.5, 0.9, normal.y));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uCharacterFillTint
          * uCharacterFillStrength * characterFillShape;
        // Soft warm rim separates figures from busy ground and floors (storybook silhouette).
        float characterRim = pow(1.0 - characterFillFacing, 3.0) * smoothstep(-0.2, 0.6, normal.y + 0.4);
        reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.9, 0.74) * characterRim * 0.42;
      `);
  };
  // Lighting changes are uniforms, so every actor can reuse the same program.
  material.customProgramCacheKey = () => "kingdom-character-diffuse-fill-v2";
  let disposed = false;
  return { material,
    setLighting(daylight, indoors) {
      if (disposed) return;
      const light = Number.isFinite(daylight) ? THREE.MathUtils.clamp(daylight, 0, 1) : 1;
      const darkness = 1 - THREE.MathUtils.smoothstep(light, .08, .8);
      fillStrength.value = indoors ? .06 : .025 + .155 * darkness;
      if (indoors) fillTint.value.copy(indoorFillTint);
      else fillTint.value.lerpColors(dayFillTint, nightFillTint, darkness);
    },
    dispose() {
    if (disposed) return; disposed = true;
    material.dispose(); albedo.dispose(); normal.dispose(); rough.dispose();
  } };
}

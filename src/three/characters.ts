import * as THREE from "three";

/** Saved colours remain authoritative. Style hints are presentation only, never campaign state. */
export interface ActorAppearance {
  skin: string;
  hair: string;
  eyes: string;
  outfit: string;
  role?: string;
  sex?: string;
  age?: number;
  variant?: string | number;
}

export interface CharacterModel {
  group: THREE.Group;
  animate(timeSeconds: number, moving: boolean, working: boolean, attacking: boolean): void;
  setEquipment(equipped: boolean): void;
  dispose(): void;
}

type Ring = [y: number, width: number, depth: number];
type Surface = "cloth" | "skin" | "hair" | "leather";
const surfaceTiles: Record<Surface, number> = { cloth: 0, skin: 1, hair: 2, leather: 3 };

/** Eight-sided cross sections give cheeks, shoulders and hems intentional planes rather than boxes. */
function tailored(rings: Ring[]): THREE.BufferGeometry {
  const outline = [[-.68, 1], [.68, 1], [1, .4], [1, -.55], [.65, -1], [-.65, -1], [-1, -.55], [-1, .4]];
  const positions: number[] = [], uvs: number[] = [];
  function point(ring: Ring, index: number) {
    const [x, z] = outline[index % 8];
    return [x * ring[1], ring[0], z * ring[2]];
  }
  function triangle(a: number[], b: number[], c: number[], uv: number[]) {
    positions.push(...a, ...b, ...c); uvs.push(...uv);
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let side = 0; side < 8; side++) {
      const a = point(rings[row], side), b = point(rings[row], side + 1);
      const c = point(rings[row + 1], side + 1), d = point(rings[row + 1], side);
      const u = side / 8, v = row / (rings.length - 1), u1 = (side + 1) / 8, v1 = (row + 1) / (rings.length - 1);
      // This outline runs clockwise when viewed from above.
      triangle(a, b, d, [u, v, u1, v, u, v1]);
      triangle(b, c, d, [u1, v, u1, v1, u, v1]);
    }
  }
  for (const end of [0, rings.length - 1]) {
    const ring = rings[end];
    for (let side = 0; side < 8; side++) {
      const a = point(ring, side), b = point(ring, side + 1), center = [0, ring[0], 0];
      triangle(center, ...(end === 0 ? [b, a] : [a, b]) as [number[], number[]], [.5, .5, 0, 0, 1, 1]);
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  result.computeVertexNormals();
  return result;
}

/** Original, DOM-free 64px atlas: woven cloth, softly mottled skin, hair grain and worn leather. */
function surfaceAtlas() {
  const size = 64, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tile = (x >= 32 ? 1 : 0) + (y >= 32 ? 2 : 0);
    const noise = ((x * 37 + y * 71 + x * y * 13) % 17) / 17;
    const value = tile === 0 ? 239 + ((x + y) % 3 === 0 ? 12 : 0) + noise * 4
      : tile === 1 ? 249 + noise * 6
      : tile === 2 ? 231 + (x % 5) * 4 + noise * 5
      : 231 + noise * 18 + (y % 9 === 0 ? 6 : 0);
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = Math.min(255, value);
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Feet rest at Y=0, face points +Z. Each articulated joint is one opaque draw, including all details. */
export function createCharacterModel(appearance: ActorAppearance, kind: "human" | "skeleton" = "human"): CharacterModel {
  const group = new THREE.Group(); group.name = `${kind}-character`;
  const body = new THREE.Group(); body.name = "animated-body"; group.add(body);
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const atlas = surfaceAtlas();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: atlas, flatShading: true, roughness: .84, metalness: .035 });
  const valid = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const skin = valid(appearance.skin, "#c9936f"), hair = valid(appearance.hair, "#543b2b");
  const eyes = valid(appearance.eyes, "#729480"), outfit = valid(appearance.outfit, "#4d7961");
  const tint = (color: string, factor: number) => `#${new THREE.Color(color).multiplyScalar(factor).getHexString()}`;
  const leather = "#62442f", linen = "#dfd1ae", iron = "#a5afb1", bone = "#d7cfb2";
  const role = appearance.role ?? "apostle";
  let seed = 0;
  for (const char of String(appearance.variant ?? role)) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
  const female = appearance.sex === "female" || appearance.sex === "Feminino";
  const elder = Number.isFinite(appearance.age) && appearance.age! >= 60;
  const hairStyle = (seed + (female ? 2 : 0)) % 4;
  const phase = (seed % 101) * .062;

  type Batch = { positions: number[]; normals: number[]; colors: number[]; uvs: number[]; parts: Record<string, { start: number; count: number }> };
  const batches = new Map<THREE.Object3D, Batch>();
  function joint(name: string, parent: THREE.Object3D, x: number, y: number, z = 0) {
    const result = new THREE.Group(); result.name = name; result.position.set(x, y, z); parent.add(result); return result;
  }
  // Named anchors survive batching for selection/debugging. Their ranges identify real rendered vertices.
  function piece(name: string, parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string,
    position: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0], surface: Surface = "cloth") {
    let batch = batches.get(parent);
    if (!batch) { batch = { positions: [], normals: [], colors: [], uvs: [], parts: {} }; batches.set(parent, batch); }
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    source.applyMatrix4(transform);
    const p = source.getAttribute("position"), n = source.getAttribute("normal"), uv = source.getAttribute("uv");
    const c = new THREE.Color(color), tile = surfaceTiles[surface], tileX = tile % 2, tileY = Math.floor(tile / 2);
    const start = batch.positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      batch.positions.push(p.getX(i), p.getY(i), p.getZ(i));
      batch.normals.push(n.getX(i), n.getY(i), n.getZ(i));
      batch.colors.push(c.r, c.g, c.b);
      // Tile gutters prevent neighbouring surfaces bleeding into one another at minification.
      batch.uvs.push(tileX * .5 + .035 + uv.getX(i) * .43, tileY * .5 + .035 + uv.getY(i) * .43);
    }
    batch.parts[name] = { start, count: p.count };
    if (parent.name !== name) {
      const anchor = new THREE.Object3D(); anchor.name = name; anchor.position.set(...position); parent.add(anchor);
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
  }
  const form = (rings: Ring[]) => tailored(rings);
  const ball = () => new THREE.SphereGeometry(1, 8, 4);
  const tube = () => new THREE.CylinderGeometry(1, 1, 1, 8);
  const head = joint(kind === "human" ? "head" : "skull", body, 0, 1.735);
  const leftLeg = joint("leg-left", body, -.145, .82), rightLeg = joint("leg-right", body, .145, .82);
  const leftArm = joint("arm-left", body, -.325, 1.36), rightArm = joint("arm-right", body, .325, 1.36);
  for (const [side, leg] of [["left", leftLeg], ["right", rightLeg]] as const) {
    piece(kind === "human" ? `trouser-${side}` : `leg-bone-${side}`, leg, form([[-.64, .075, .08], [-.32, .087, .084], [0, .098, .105]]), kind === "human" ? tint(outfit, .44) : bone);
    piece(kind === "human" ? `boot-${side}` : `foot-bones-${side}`, leg, form([[-.82, .092, .151], [-.77, .103, .162], [-.64, .085, .12], [-.54, .083, .083]]), kind === "human" ? leather : bone, [0, 0, .045], [1, 1, 1], [0, 0, 0], "leather");
    piece(`boot-cuff-${side}`, leg, tube(), kind === "human" ? "#8b6745" : "#b9b097", [0, -.55, 0], [.098, .07, .10], [0, 0, 0], "leather");
  }
  for (const [side, arm] of [["left", leftArm], ["right", rightArm]] as const) {
    const rolled = ["smith", "farmer", "baker", "miller", "fisher"].includes(role);
    piece(kind === "human" ? `sleeve-${side}` : `arm-bone-${side}`, arm, form([[-.29, .078, .085], [-.18, .105, .11], [0, .128, .13]]), kind === "human" ? outfit : bone);
    piece(`forearm-${side}`, arm, form([[-.49, .060, .067], [-.31, .075, .075], [-.26, .08, .08]]), kind === "human" ? (rolled ? skin : tint(outfit, .8)) : bone, [0, 0, .01], [1, 1, 1], [0, 0, 0], rolled ? "skin" : "cloth");
    piece(kind === "human" ? `hand-${side}` : `hand-bones-${side}`, arm, form([[-.62, .055, .055], [-.58, .074, .065], [-.47, .063, .058]]), kind === "human" ? skin : bone, [0, 0, .025], [1, 1, 1], [0, 0, 0], "skin");
    piece(`cuff-${side}`, arm, tube(), rolled ? linen : leather, [0, -.29, 0], [.084, .065, .088], [0, 0, 0], "leather");
  }

  let cloak: THREE.Group | undefined;
  if (kind === "human") {
    const long = ["matron", "innkeeper", "pilgrim"].includes(role);
    const coat = ["merchant", "traveler", "courier"].includes(role);
    const broad = role === "smith" ? 1.12 : role === "guard" ? 1.08 : 1;
    piece("tunic", body, form([[long ? .27 : coat ? .58 : .76, long ? .34 : .30, .235], [.83, .27, .207], [1.04, .236, .18], [1.32, .305, .205], [1.43, .256, .17]]), outfit, [0, 0, 0], [broad, 1, 1]);
    // Collar facings and a small neck opening leave a strong light/dark neckline.
    piece("neck", body, tube(), skin, [0, 1.48, 0], [.092, .18, .086], [0, 0, 0], "skin");
    for (const sign of [-1, 1]) {
      piece(`collar-${sign}`, body, form([[-.12, .053, .018], [0, .088, .021], [.06, .056, .016]]), linen, [sign * .087, 1.38, .168], [1, 1, 1], [0, 0, sign * -.5]);
    }
    piece("belt", body, tube(), leather, [0, .99, 0], [.268 * broad, .077, .212], [0, 0, 0], "leather");
    piece("belt-buckle", body, form([[-.035, .048, .013], [.035, .048, .013]]), "#c5a264", [0, .99, .217]);
    piece("belt-pouch", body, form([[-.10, .075, .043], [-.06, .095, .06], [.09, .078, .048]]), leather, [-.26, .90, .10], [1, 1, 1], [0, 0, -.14], "leather");
    piece("head", head, form([[-.255, .11, .105], [-.21, .175, .162], [-.08, .225, .198], [.095, elder ? .225 : .238, .19], [.21, .205, .17], [.26, .125, .11]]), skin, [0, 0, .003], [1, 1, 1], [0, 0, 0], "skin");
    piece("hair", head, new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI * .47), hair, [0, .038, -.015], [.252, .252, .226], [0, 0, .04 * (seed % 3 - 1)], "hair");
    const hairLength = hairStyle === 1 ? .31 : hairStyle === 3 ? .34 : .20;
    piece("hair-back", head, form([[-hairLength, .15, .055], [-.04, .228, .077], [.15, .20, .065]]), tint(hair, .83), [0, 0, -.17], [1, 1, 1], [0, 0, 0], "hair");
    piece("hair-sweep", head, ball(), hair, [hairStyle % 2 ? -.10 : .105, .16, .16], [.145, .065, .068], [0, 0, hairStyle % 2 ? -.3 : .3], "hair");
    if (hairStyle === 2) piece("hair-bun", head, ball(), hair, [0, .10, -.265], [.13, .13, .12], [0, 0, 0], "hair");
    if (hairStyle === 3) {
      for (let row = 0; row < 3; row++) piece(`braid-${row}`, head, ball(), tint(hair, row % 2 ? .85 : 1), [.16 - row * .018, -.18 - row * .105, -.18], [.057, .073, .057], [0, 0, 0], "hair");
    }
    for (const [side, x] of [["left", -.088], ["right", .088]] as const) {
      piece(`eye-white-${side}`, head, ball(), "#e8dac3", [x, .025, .197], [.050, .030, .013], [0, 0, 0], "skin");
      piece(`iris-${side}`, head, ball(), eyes, [x, .025, .209], [.022, .026, .008], [0, 0, 0], "skin");
      piece(`pupil-${side}`, head, new THREE.SphereGeometry(1, 6, 3), "#262522", [x, .026, .216], [.010, .018, .004], [0, 0, 0], "skin");
      piece(`brow-${side}`, head, form([[-.012, .055, .012], [.012, .048, .012]]), tint(hair, .6), [x, .069, .202], [1, 1, 1], [0, 0, x < 0 ? -.07 : .07], "hair");
      piece(`ear-${side}`, head, new THREE.SphereGeometry(1, 6, 3), skin, [Math.sign(x) * .234, -.018, -.008], [.043, .068, .034], [0, 0, 0], "skin");
      if (elder) piece(`age-line-${side}`, head, form([[-.005, .04, .004], [.005, .045, .004]]), tint(skin, .65), [x, -.025, .202]);
    }
    piece("nose", head, form([[-.07, .037, .026], [-.045, .043, .040], [.04, .018, .009]]), tint(skin, 1.04), [0, -.018, .204], [1, 1, 1], [0, 0, 0], "skin");
    piece("mouth", head, form([[-.008, .042, .006], [.008, .039, .006]]), "#945f50", [0, -.153, .169]);
    if (!female && seed % 3 === 0) piece("beard", head, form([[-.25, .075, .025], [-.17, .154, .024], [-.10, .115, .020]]), tint(hair, .90), [0, 0, .15], [1, 1, 1], [0, 0, 0], "hair");

    const apron = ["smith", "baker", "miller", "innkeeper"].includes(role);
    if (apron) {
      const apronColor = role === "smith" ? "#654631" : role === "miller" ? "#c8bea3" : linen;
      piece("profession-apron", body, form([[role === "innkeeper" ? .35 : .57, .23, .017], [.90, .21, .022], [1.29, .165, .015]]), apronColor, [0, 0, .223], [1, 1, 1], [0, 0, 0], role === "smith" ? "leather" : "cloth");
      piece("apron-pocket", body, form([[-.055, .09, .013], [.055, .10, .014]]), tint(apronColor, .75), [0, .86, .25]);
    }
    if (["merchant", "traveler", "courier", "fisher", "porter"].includes(role)) {
      const pack = role === "porter";
      piece(pack ? "porter-pack" : "satchel", body, form([[-.23, .16, .11], [-.17, .205, .14], [.19, .18, .12], [.25, .14, .08]]), role === "fisher" ? "#9d8852" : leather, [pack ? 0 : .28, pack ? 1.16 : .88, pack ? -.29 : .025], pack ? [1.45, 1.4, 1.25] : [1, 1, 1], [0, 0, -.08], "leather");
      piece("shoulder-strap", body, form([[-.31, .032, .012], [.31, .032, .012]]), "#a18554", [0, 1.2, .223], [1, 1, 1], [0, 0, -.55], "leather");
      if (pack) piece("pack-bedroll", body, tube(), "#a89a73", [0, 1.55, -.31], [.13, .58, .13], [0, 0, Math.PI / 2]);
    }
    if (["apostle", "ranger", "pilgrim", "courier", "traveler", "matron"].includes(role)) {
      cloak = joint("cape", body, 0, 1.40, -.15);
      const length = role === "pilgrim" ? 1.00 : role === "ranger" ? .86 : role === "matron" ? .40 : role === "courier" ? .48 : .66;
      // A flared, folded mantle, not a slab. Its thin front remains behind the torso.
      piece("cape-cloth", cloak, form([[-length, .34, .034], [-length + .08, .36, .035], [-.18, .28, .047], [.05, .20, .03]]), tint(outfit, role === "matron" ? 1.25 : .58), [0, 0, -.10]);
    }
    if (["farmer", "fisher", "traveler"].includes(role)) {
      const straw = role === "farmer" ? "#c7a666" : role === "fisher" ? "#817459" : tint(outfit, .65);
      piece("hat-brim", head, tube(), straw, [0, .18, -.01], [role === "farmer" ? .39 : .32, .035, .31], [0, 0, role === "fisher" ? .08 : -.04]);
      piece("hat-crown", head, form([[0, .245, .20], [.17, .18, .15]]), straw, [0, .19, -.02]);
      piece("hat-band", head, tube(), leather, [0, .215, -.02], [.24, .038, .195]);
    } else if (["baker", "miller", "merchant", "porter"].includes(role)) {
      const capColor = role === "baker" ? linen : role === "miller" ? "#bfb79f" : tint(outfit, .7);
      piece("profession-cap", head, ball(), capColor, [role === "merchant" ? .05 : 0, .19, -.02], [role === "merchant" ? .29 : .26, role === "baker" ? .135 : .11, .235]);
      if (role === "baker") piece("kerchief-knot", head, ball(), linen, [.18, .04, -.19], [.09, .055, .06]);
    } else if (["ranger", "pilgrim"].includes(role)) {
      piece("hood-back", head, form([[-.26, .235, .095], [.12, .28, .13], [.34, role === "ranger" ? .06 : .12, .025]]), tint(outfit, .62), [0, 0, -.15]);
      for (const sign of [-1, 1]) piece(`hood-side-${sign}`, head, form([[-.20, .05, .10], [.16, .06, .12], [.27, .04, .09]]), tint(outfit, .65), [sign * .23, 0, -.015]);
    }
    if (role === "guard") {
      piece("helmet", head, new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI * .49), iron, [0, .06, -.008], [.274, .28, .246], [0, 0, 0], "leather");
      piece("helmet-rim", head, tube(), "#6c787c", [0, .09, 0], [.28, .05, .25]);
      for (const arm of [leftArm, rightArm]) piece("shoulder-armour", arm, ball(), iron, [0, -.015, 0], [.19, .115, .17]);
      piece("guard-tabard", body, form([[.66, .17, .014], [1.30, .18, .014]]), tint(outfit, 1.3), [0, 0, .223]);
    }
    if (role === "ranger") piece("quiver", body, form([[-.30, .085, .07], [.28, .10, .085]]), leather, [.23, 1.19, -.27], [1, 1, 1], [0, 0, -.2], "leather");
    if (role === "pilgrim") piece("pilgrim-scallop", body, ball(), linen, [.10, 1.29, .24], [.08, .068, .018]);
    if (role === "courier") piece("courier-scarf", body, form([[-.16, .07, .014], [.13, .09, .017]]), "#c89653", [.13, 1.30, .245], [1, 1, 1], [0, 0, -.16]);
  } else {
    piece("spine", body, tube(), "#b9b097", [0, 1.15, -.055], [.063, .61, .063]);
    piece("pelvis", body, form([[.76, .16, .11], [.83, .21, .12], [.95, .17, .10]]), bone);
    piece("collar-bones", body, tube(), bone, [0, 1.37, 0], [.046, .54, .05], [0, 0, Math.PI / 2]);
    for (let row = 0; row < 3; row++) for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
      piece(`rib-${side}-${row}`, body, form([[-.025, .135, .045], [.025, .13, .047]]), bone, [sign * .12, 1.27 - row * .13, .04], [1, 1, 1], [0, 0, -sign * .16]);
    }
    piece("neck-bone", body, tube(), bone, [0, 1.49, 0], [.06, .17, .06]);
    piece("skull", head, form([[-.20, .15, .12], [-.05, .23, .18], [.15, .24, .19], [.26, .14, .10]]), bone);
    piece("jaw", head, form([[-.23, .13, .09], [-.15, .16, .10]]), "#bfb597", [0, 0, .08]);
    for (const [side, x] of [["left", -.093], ["right", .093]] as const) {
      piece(`eye-socket-${side}`, head, ball(), "#2c302b", [x, .04, .184], [.078, .079, .021]);
      piece(`iris-${side}`, head, ball(), "#c09154", [x, .04, .206], [.018, .026, .007]);
    }
    piece("nasal-cavity", head, form([[-.03, .029, .009], [.03, .014, .006]]), "#49483a", [0, -.05, .195]);
    piece("teeth-line", head, form([[-.009, .122, .006], [.009, .12, .006]]), "#797461", [0, -.14, .19]);
    piece("shoulder-armour", leftArm, ball(), "#68716b", [0, -.025, 0], [.19, .14, .18]);
  }

  const sword = joint("sword", rightArm, 0, -.55, .045); sword.rotation.z = Math.PI;
  piece("sword-hilt", sword, tube(), leather, [0, .025, 0], [.034, .19, .034], [0, 0, 0], "leather");
  piece("sword-guard", sword, form([[-.023, .13, .032], [.023, .13, .032]]), "#b7a069", [0, .135, 0]);
  piece("sword-blade", sword, form([[.16, .043, .017], [.69, .032, .013], [.77, .001, .001]]), iron);
  const tool = joint("work-tool", rightArm, 0, -.55, .035);
  piece("tool-handle", tool, tube(), "#9a7447", [0, -.21, 0], [.034, .70, .034], [0, 0, 0], "leather");
  piece("tool-pick-head", tool, form([[-.045, .27, .04], [.045, .23, .05]]), "#7c898b", [0, -.49, 0], [1, 1, 1], [0, 0, .15]);
  piece("tool-pick-point", tool, form([[0, .045, .045], [.19, .001, .001]]), iron, [.22, -.46, 0], [1, 1, 1], [0, 0, -Math.PI / 2]);
  sword.visible = false; tool.visible = false;

  for (const [parent, batch] of batches) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(batch.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(batch.colors, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(batch.uvs, 2));
    geometry.userData.parts = batch.parts;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `${parent.name}-surface`;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); ownedGeometries.push(geometry);
  }
  batches.clear();
  let equipped = false, isWorking = false, wasAttacking = false, attackStarted = 0, disposed = false;
  const updateEquipment = () => { sword.visible = equipped && !isWorking; tool.visible = isWorking; };
  return {
    group,
    setEquipment(value) { if (!disposed) { equipped = value; updateEquipment(); } },
    animate(timeSeconds, moving, working, attacking) {
      if (disposed) return;
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      const stride = moving ? Math.sin(time * 10) * .58 || 0 : 0;
      body.position.y = moving ? Math.abs(Math.sin(time * 10)) * .11 : 0;
      body.rotation.z = 0; // Soles remain on/above terrain; idle breath belongs to head and mantle.
      leftLeg.rotation.x = stride; rightLeg.rotation.x = stride === 0 ? 0 : -stride;
      leftArm.rotation.x = stride === 0 ? 0 : -stride * .78; rightArm.rotation.x = stride * .78;
      leftArm.rotation.z = .075; rightArm.rotation.z = -.075;
      head.rotation.y = Math.sin(time * .85 + phase) * .035;
      head.rotation.z = Math.sin(time * .65 + phase) * .012;
      if (cloak) cloak.rotation.x = moving ? -.06 + Math.sin(time * 10 + .6) * .055 : Math.sin(time * 1.5 + phase) * .012;
      isWorking = working && !attacking;
      if (isWorking) {
        rightArm.rotation.x = -1.75 + Math.sin(time * 6) * .85;
        rightArm.rotation.z = -.14; leftArm.rotation.x = -.8 + Math.sin(time * 6) * .24;
      }
      if (attacking) {
        if (!wasAttacking) attackStarted = time;
        const progress = THREE.MathUtils.clamp((time - attackStarted) / .28, 0, 1);
        rightArm.rotation.x = -2.8 + progress * 2.1;
        rightArm.rotation.z = -.35 + Math.sin(progress * Math.PI) * .52;
        leftArm.rotation.x = -.6; body.rotation.y = -.25 + progress * .5;
      } else body.rotation.y = 0;
      wasAttacking = attacking; updateEquipment();
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const geometry of ownedGeometries) geometry.dispose();
      ownedGeometries.length = 0; material.dispose(); atlas.dispose(); group.clear();
    },
  };
}

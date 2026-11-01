import * as THREE from "three";
import { loadRiggedCharacters } from "./rigged-characters";

/**
 * Authored art made in Blender (see art/). Loading is optional: when a file is missing or
 * fails, the procedural fallbacks keep the world complete. Nothing here touches the campaign.
 */
export type TreePart = { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial };
export type TreeAsset = { wood: TreePart; leaves: TreePart; height: number };
type Cache = { buildings: Map<string, THREE.Object3D>; trees: Map<string, TreeAsset>; props: Map<string, TreePart[]> };
const cache: Cache = { buildings: new Map(), trees: new Map(), props: new Map() };

/** Float, transform-applied copy of a loaded mesh (glTF quantization lives in the node transform). */
function bakeGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const source = mesh.geometry, geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const item = attribute.itemSize, count = attribute.count, data = new Float32Array(count * item);
    for (let i = 0; i < count; i++) for (let c = 0; c < item; c++) data[i * item + c] = attribute.getComponent(i, c);
    geometry.setAttribute(name, new THREE.BufferAttribute(data, item));
  }
  if (source.index) geometry.setIndex(Array.from(source.index.array));
  mesh.updateWorldMatrix(true, false);
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
let loading: Promise<void> | null = null;

/** Building ids exported by art/blender/buildings.py. */
export const BUILDING_ASSETS = ["orphanage", "inn", "house", "forge", "bakery", "farm-shed", "owned-home", "estate-home"] as const;

export function assetIdForKind(kind: string): string | null {
  if (kind === "estate-home") return "estate-home";
  return (BUILDING_ASSETS as readonly string[]).includes(kind) ? kind : null;
}

export function loadArtAssets(base = "/"): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`${base}models/village-buildings.glb`);
      for (const child of [...gltf.scene.children]) {
        child.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true; mesh.receiveShadow = true;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const standard = material as THREE.MeshStandardMaterial;
            // glTF exports double-sided; closed buildings render faster single-sided.
            standard.side = THREE.FrontSide;
            if (standard.aoMap) standard.aoMapIntensity = 1;
          }
        });
        cache.buildings.set(child.name, child);
      }
      const trees = await loader.loadAsync(`${base}models/trees.glb`).catch(() => null);
      if (trees) {
        trees.scene.updateMatrixWorld(true);
        const parts = new Map<string, TreePart>();
        trees.scene.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const material = (mesh.material as THREE.MeshStandardMaterial);
          const leaves = mesh.name.endsWith("-leaves") || object.parent?.name.endsWith("-leaves");
          if (leaves) { material.alphaTest = .5; material.transparent = false; material.side = THREE.DoubleSide; }
          parts.set((mesh.name.endsWith("-leaves") || mesh.name.endsWith("-wood")) ? mesh.name : object.parent?.name ?? mesh.name,
            { geometry: bakeGeometry(mesh), material });
        });
        for (const [name, wood] of parts) {
          if (!name.endsWith("-wood")) continue;
          const id = name.slice(0, -5), leaves = parts.get(`${id}-leaves`);
          if (!leaves) continue;
          const height = Math.max(wood.geometry.boundingBox!.max.y, leaves.geometry.boundingBox!.max.y);
          cache.trees.set(id, { wood, leaves, height });
        }
      }
      await loadRiggedCharacters(base, loader);
      const props = await loader.loadAsync(`${base}models/props.glb`).catch(() => null);
      if (props) {
        props.scene.updateMatrixWorld(true);
        for (const root of props.scene.children) {
          const parts: TreePart[] = [];
          root.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (material.name.startsWith("leaves")) { material.alphaTest = .5; material.transparent = false; material.side = THREE.DoubleSide; }
            parts.push({ geometry: bakeGeometry(mesh), material });
          });
          if (parts.length) cache.props.set(root.name, parts);
        }
      }
    } catch (error) {
      console.warn("Kingdom Gods: arte do Blender indisponível; usando modelos procedurais.", error);
    }
  })();
  return loading;
}

/** A placement copy: geometry and textures are shared, materials are per copy (roofs fade independently). */
export function buildingAsset(id: string | null): { object: THREE.Object3D; materials: THREE.MeshStandardMaterial[] } | null {
  const source = id ? cache.buildings.get(id) : undefined;
  if (!source) return null;
  // The source node carries the mesh-quantization transform; keep it and move a wrapper instead.
  const object = new THREE.Group();
  object.name = `authored-${id}`;
  object.add(source.clone(true));
  const materials: THREE.MeshStandardMaterial[] = [];
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material) => {
      let copy = copies.get(material);
      if (!copy) { copy = (material as THREE.MeshStandardMaterial).clone(); copies.set(material, copy); materials.push(copy); }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return { object, materials };
}

export function hasArtAssets(): boolean { return cache.buildings.size > 0; }

/** Geometry/material pairs of a Blender prop (rock-0, ore-0, herb-0, log-0, stump-0, shrub-0, fence-post…). */
export function propParts(id: string): TreePart[] { return cache.props.get(id) ?? []; }

/** A ready-to-place group of shared meshes; callers must not dispose its geometry or materials. */
export function propObject(id: string): THREE.Group | null {
  const parts = propParts(id);
  if (!parts.length) return null;
  const group = new THREE.Group(); group.name = `prop-${id}`;
  for (const part of parts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Authored variants for a forest kind (oak, broadleaf, pine); empty when the art is unavailable. */
export function treeVariants(kind: "oak" | "broadleaf" | "pine"): TreeAsset[] {
  return [0, 1].map(i => cache.trees.get(`${kind}-${i}`)).filter((tree): tree is TreeAsset => !!tree);
}

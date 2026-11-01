import * as THREE from "three";

/**
 * Authored art made in Blender (see art/). Loading is optional: when a file is missing or
 * fails, the procedural fallbacks keep the world complete. Nothing here touches the campaign.
 */
type Cache = { buildings: Map<string, THREE.Object3D> };
const cache: Cache = { buildings: new Map() };
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

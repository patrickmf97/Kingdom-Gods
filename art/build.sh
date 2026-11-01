#!/usr/bin/env bash
# Rebuilds the authored art. Needs Blender's Python module: pip install bpy==5.2.3
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx art/export-specs.ts
python3 art/blender/textures.py art/build/textures
python3 art/blender/buildings.py
npx gltf-transform optimize public/models/village-buildings.glb public/models/village-buildings.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify false
python3 art/blender/trees.py
npx gltf-transform optimize public/models/trees.glb public/models/trees.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify false --instance false --join false --flatten false
python3 art/blender/props.py
npx gltf-transform optimize public/models/props.glb public/models/props.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify false --instance false --join false --flatten false

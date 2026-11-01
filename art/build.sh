#!/usr/bin/env bash
# Rebuilds the authored art. Needs Blender's Python module: pip install bpy==5.2.3
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx art/export-specs.ts
python3 art/blender/textures.py art/build/textures
python3 art/blender/buildings.py
npx gltf-transform optimize public/models/village-buildings.glb public/models/village-buildings.glb \
  --compress meshopt --texture-compress webp --texture-size 512 --simplify false

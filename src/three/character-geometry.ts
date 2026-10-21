import * as THREE from 'three';
export type TailorRing = readonly [
    y: number,
    width: number,
    depth: number
];
/** Indexed lofts keep radial normals shared before the actor's articulated batches are expanded. */
export function tailored(rings: readonly TailorRing[], segments = 12): THREE.BufferGeometry {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let row = 0; row < rings.length; row++) {
        const [y, w, d] = rings[row], a = rings[Math.max(0, row - 1)], b = rings[Math.min(rings.length - 1, row + 1)];
        const dy = b[0] - a[0], dw = dy ? (b[1] - a[1]) / dy : 0, dd = dy ? (b[2] - a[2]) / dy : 0;
        for (let side = 0; side <= segments; side++) {
            const angle = side / segments * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
            positions.push(c * w, y, s * d);
            const n = new THREE.Vector3(c / Math.max(w, .001), -(dw / Math.max(w, .001) * c * c + dd / Math.max(d, .001) * s * s), s / Math.max(d, .001)).normalize();
            normals.push(n.x, n.y, n.z);
            uvs.push(side / segments, row / (rings.length - 1));
        }
    }
    for (let row = 0; row < rings.length - 1; row++)
        for (let side = 0; side < segments; side++) {
            const a = row * (segments + 1) + side, b = a + segments + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    for (const end of [0, rings.length - 1]) {
        const [y, w, d] = rings[end], center = positions.length / 3;
        positions.push(0, y, 0);
        normals.push(0, end ? 1 : -1, 0);
        uvs.push(.5, .5);
        for (let side = 0; side <= segments; side++) {
            const angle = side / segments * Math.PI * 2;
            positions.push(Math.cos(angle) * w, y, Math.sin(angle) * d);
            normals.push(0, end ? 1 : -1, 0);
            uvs.push(.5 + Math.cos(angle) * .5, .5 + Math.sin(angle) * .5);
        }
        for (let side = 0; side < segments; side++)
            indices.push(center, ...(end ? [center + side + 2, center + side + 1] : [center + side + 1, center + side + 2]));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    return g;
}
export function strand(points: readonly (readonly [
    number,
    number,
    number
])[], radius: number, segments = 6, sides = 5): THREE.BufferGeometry {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), frames = curve.computeFrenetFrames(segments, false);
    const p: number[] = [], n: number[] = [], uv: number[] = [], index: number[] = [];
    for (let row = 0; row <= segments; row++) {
        const t = row / segments, center = curve.getPointAt(t), r = radius * (.85 + .15 * Math.sin(t * Math.PI)) * (1 - .80 * Math.pow(t, 4));
        for (let side = 0; side <= sides; side++) {
            const theta = side / sides * Math.PI * 2, normal = frames.normals[row].clone().multiplyScalar(Math.cos(theta)).addScaledVector(frames.binormals[row], Math.sin(theta));
            const point = center.clone().addScaledVector(normal, r);
            p.push(point.x, point.y, point.z);
            n.push(normal.x, normal.y, normal.z);
            uv.push(side / sides, t);
        }
    }
    for (let row = 0; row < segments; row++)
        for (let side = 0; side < sides; side++) {
            const a = row * (sides + 1) + side, b = a + sides + 1;
            index.push(a, a + 1, b, a + 1, b + 1, b);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
}
/** A cap follows the skull but opens above the forehead instead of hiding the eyes. */
export function scalp(segments = 16, rows = 6): THREE.BufferGeometry {
    const p: number[] = [], n: number[] = [], uv: number[] = [], index: number[] = [];
    for (let row = 0; row <= rows; row++)
        for (let side = 0; side <= segments; side++) {
            const a = side / segments * Math.PI * 2, phi = (row / rows) * (1.66 - .46 * Math.sin(a));
            const x = Math.cos(a) * Math.sin(phi), y = Math.cos(phi), z = Math.sin(a) * Math.sin(phi);
            p.push(x, y, z);
            n.push(x, y, z);
            uv.push(side / segments, row / rows);
        }
    for (let row = 0; row < rows; row++)
        for (let side = 0; side < segments; side++) {
            const a = row * (segments + 1) + side, b = a + segments + 1;
            index.push(a, a + 1, b, a + 1, b + 1, b);
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    return g;
}

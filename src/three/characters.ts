import * as THREE from 'three';
import { tailored, scalp, strand, type TailorRing } from './character-geometry';
import { createCharacterMaterials, characterUV, type CharacterSurface } from './character-materials';
/** Existing saved colours stay authoritative; sculptural hints never alter campaign data. */
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
    animate(timeSeconds: number, moving: boolean, working: boolean, attacking: boolean, speed?: number): void;
    setEquipment(equipped: boolean): void;
    setLighting(daylight: number, indoors: boolean): void;
    dispose(): void;
}
/** Tailored fantasy figures, approximately 5½ heads high; each moving joint is one merged draw. */
export function createCharacterModel(appearance: ActorAppearance, kind: 'human' | 'skeleton' = 'human'): CharacterModel {
    const group = new THREE.Group();
    group.name = `${kind}-character`;
    const body = new THREE.Group();
    body.name = 'animated-body';
    group.add(body);
    const surfaces = createCharacterMaterials(), material = surfaces.material, geometries: THREE.BufferGeometry[] = [];
    const valid = (s: string, f: string) => /^#[\da-f]{6}$/i.test(s) ? s : f;
    const skin = valid(appearance.skin, '#c9936f'), hair = valid(appearance.hair, '#543b2b'), eyes = valid(appearance.eyes, '#729480'), outfit = valid(appearance.outfit, '#4d7961');
    const tint = (s: string, k: number) => `#${new THREE.Color(s).multiplyScalar(k).getHexString()}`;
    const leather = '#634934', linen = '#ded5bd', iron = '#aeb8bc', bone = '#d7cfb2', role = appearance.role ?? 'apostle';
    let seed = 0;
    for (const c of String(appearance.variant ?? role))
        seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
    const female = appearance.sex === 'female' || appearance.sex === 'Feminino', elder = (appearance.age ?? 22) >= 60, style = (seed + (female ? 2 : 0)) % 4, phase = (seed % 101) * .062;
    type Batch = {
        p: number[];
        n: number[];
        c: number[];
        uv: number[];
        parts: Record<string, {
            start: number;
            count: number;
        }>;
    };
    const batches = new Map<THREE.Object3D, Batch>();
    function joint(name: string, parent: THREE.Object3D, x: number, y: number, z = 0) { const j = new THREE.Group(); j.name = name; j.position.set(x, y, z); parent.add(j); return j; }
    function piece(name: string, parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, position: [
        number,
        number,
        number
    ] = [0, 0, 0], scale: [
        number,
        number,
        number
    ] = [1, 1, 1], rotation: [
        number,
        number,
        number
    ] = [0, 0, 0], surface: CharacterSurface = 'cloth') {
        let batch = batches.get(parent);
        if (!batch) {
            batch = { p: [], n: [], c: [], uv: [], parts: {} };
            batches.set(parent, batch);
        }
        const g = geometry.index ? geometry.toNonIndexed() : geometry;
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
        const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv'), c = new THREE.Color(color), start = batch.p.length / 3;
        for (let i = 0; i < p.count; i++) {
            batch.p.push(p.getX(i), p.getY(i), p.getZ(i));
            batch.n.push(n.getX(i), n.getY(i), n.getZ(i));
            batch.c.push(c.r, c.g, c.b);
            batch.uv.push(...characterUV(surface, uv.getX(i), uv.getY(i)));
        }
        batch.parts[name] = { start, count: p.count };
        if (parent.name !== name) {
            const anchor = new THREE.Object3D();
            anchor.name = name;
            anchor.position.set(...position);
            parent.add(anchor);
        }
        if (g !== geometry)
            g.dispose();
        geometry.dispose();
    }
    const form = (rings: readonly TailorRing[], segments = 12) => tailored(rings, segments);
    const orb = (w = 10, h = 5) => new THREE.SphereGeometry(1, w, h);
    const disc = () => new THREE.CircleGeometry(1, 12);
    const tube = () => new THREE.CylinderGeometry(1, 1, 1, 10);
    const lock = (name: string, parent: THREE.Object3D, points: readonly (readonly [
        number,
        number,
        number
    ])[], radius: number, color = hair, surface: CharacterSurface = 'hair', segments = 6) => piece(name, parent, strand(points, radius, segments), color, [0, 0, 0], [1, 1, 1], [0, 0, 0], surface);
    const head = joint(kind === 'human' ? 'head' : 'skull', body, 0, 1.879);
    const legs = [joint('leg-left', body, -.116, 1), joint('leg-right', body, .116, 1)];
    const knees = legs.map((leg, i) => joint(i ? 'knee-right' : 'knee-left', leg, 0, -.48));
    const arms = [joint('arm-left', body, -.263, 1.503), joint('arm-right', body, .263, 1.503)];
    const elbows = arms.map((arm, i) => joint(i ? 'elbow-right' : 'elbow-left', arm, 0, -.29));
    for (let i = 0; i < 2; i++) {
        const side = i ? 'right' : 'left', leg = legs[i], knee = knees[i], arm = arms[i], elbow = elbows[i];
        piece(kind === 'human' ? `trouser-${side}` : `thigh-bone-${side}`, leg, form([[-.49, .066, .066], [-.27, .079, .084], [0, .093, .098]], 10), kind === 'human' ? tint(outfit, .48) : bone);
        piece(kind === 'human' ? `shin-${side}` : `leg-bone-${side}`, knee, form([[-.38, .052, .058], [-.17, .061, .064], [0, .066, .068]], 10), kind === 'human' ? tint(outfit, .46) : bone);
        piece(kind === 'human' ? `boot-${side}` : `foot-bones-${side}`, knee, form([[-.52, .067, .113], [-.485, .079, .128], [-.43, .073, .115], [-.35, .057, .073], [-.22, .06, .065]], 12), kind === 'human' ? leather : bone, [0, 0, .029], [1, 1, 1], [0, 0, 0], 'leather');
        if (kind === 'human') {
            piece(`boot-sole-${side}`, knee, form([[-.52, .068, .114], [-.495, .081, .132]], 12), tint(leather, .56), [0, 0, .029], [1, 1, 1], [0, 0, 0], 'dark');
            piece(`boot-cuff-${side}`, knee, tube(), tint(leather, 1.16), [0, -.235, 0], [.064, .038, .071], [0, 0, 0], 'leather');
            lock(`boot-seam-${side}`, knee, [[.061, -.26, .05], [.063, -.35, .064], [.065, -.42, .10]], .003, tint(leather, 1.4), 'leather', 3);
        }
        const rolled = ['smith', 'farmer', 'baker', 'miller', 'fisher'].includes(role);
        piece(kind === 'human' ? `sleeve-${side}` : `arm-bone-${side}`, arm, form(kind === 'human' ? [[-.285, .058, .062], [-.16, .069, .074], [-.035, .086, .084], [.033, .086, .082], [.067, .052, .052], [.079, .014, .016]] : [[-.285, .039, .042], [-.16, .047, .049], [0, .055, .056]], 12), kind === 'human' ? outfit : bone);
        piece(`forearm-${side}`, elbow, form([[-.245, .038, .043], [-.16, .047, .052], [0, .057, .060]], 10), kind === 'human' ? (rolled ? skin : tint(outfit, .87)) : bone, [0, 0, .006], [1, 1, 1], [0, 0, 0], rolled ? 'skin' : 'cloth');
        piece(`cuff-${side}`, elbow, tube(), rolled ? linen : leather, [0, -.025, .004], [.062, .036, .064], [0, 0, 0], rolled ? 'linen' : 'leather');
        piece(kind === 'human' ? `hand-${side}` : `hand-bones-${side}`, elbow, orb(8, 4), kind === 'human' ? skin : bone, [0, -.293, .012], [.050, .095, .038], [0, 0, 0], 'skin');
        if (kind === 'human')
            lock(`thumb-${side}`, elbow, [[(i ? -1 : 1) * .045, -.252, .022], [(i ? -1 : 1) * .067, -.279, .033], [(i ? -1 : 1) * .060, -.317, .041]], .0165, skin, 'skin', 3);
    }
    let cape: THREE.Group | undefined;
    if (kind === 'human') {
        const robe = ['matron', 'innkeeper', 'pilgrim'].includes(role), coat = ['merchant', 'traveler', 'courier'].includes(role), broad = role === 'smith' ? 1.08 : role === 'guard' ? 1.05 : 1;
        const hem = robe ? .24 : coat ? .59 : .84, waist = female ? .157 : .174;
        piece('tunic', body, form([[hem, robe ? .265 : coat ? .247 : .227, robe ? .153 : .139], [.98, .205, .132], [1.19, waist, .115], [1.39, .226, .137], [1.53, .228, .125], [1.59, .157, .088]], 14), outfit, [0, 0, 0], [broad, 1, 1]);
        piece('neck', body, form([[1.55, .066, .061], [1.75, .063, .058]], 12), skin, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'skin');
        for (const sign of [-1, 1]) {
            lock(`collar-${sign}`, body, [[sign * .105, 1.567, .074], [sign * .074, 1.525, .112], [sign * .024, 1.47, .139]], .020, linen, 'linen', 4);
            lock(`tunic-seam-${sign}`, body, [[sign * .208, 1.45, .071], [sign * .176, 1.20, .086], [sign * .208, .96, .089]], .0028, tint(outfit, 1.15), 'cloth', 4);
        }
        piece('belt', body, tube(), leather, [0, 1.14, 0], [waist + .012, .058, .133], [0, 0, 0], 'leather');
        piece('belt-buckle', body, form([[-.027, .034, .008], [.027, .034, .008]], 8), '#bda15e', [0, 1.14, .137], [1, 1, 1], [0, 0, 0], 'metal');
        piece('belt-pouch', body, form([[-.07, .053, .035], [-.04, .069, .046], [.065, .057, .035]], 10), leather, [-.19, 1.05, .07], [1, 1, 1], [0, 0, -.08], 'leather');
        lock('tunic-hem-trim', body, [[-.204, hem + .025, .06], [-.125, hem + .017, .123], [0, hem + .014, .139], [.125, hem + .017, .123], [.204, hem + .025, .06]], .008, tint(outfit, 1.24), 'cloth', 8);
        // Gently shaped cheeks/chin and a small brow ridge; no oversized eyeballs or projecting peg nose.
        piece('head', head, form([[-.184, .060, .056], [-.153, .095, .087], [-.104, .126, .106], [-.028, elder ? .139 : .144, .118], [.060, .143, .117], [.127, .124, .099], [.171, .078, .063], [.184, .025, .023]], 16), skin, [0, 0, 0], [female ? .97 : 1, 1, 1], [0, 0, 0], 'skin');
        for (const [side, sign] of [['left', -1], ['right', 1]] as const) {
            piece(`ear-${side}`, head, orb(8, 4), skin, [sign * .143, -.018, -.005], [.024, .043, .018], [0, 0, sign * -.05], 'skin');
            piece(`ear-inner-${side}`, head, orb(6, 3), tint(skin, .84), [sign * .154, -.018, .008], [.011, .025, .009], [0, 0, 0], 'skin');
            const x = sign * .055;
            piece(`eye-white-${side}`, head, disc(), '#ddd2bc', [x, .013, .114], [.028, .010, 1], [0, sign * .12, sign * -.025], 'eye');
            piece(`iris-${side}`, head, disc(), eyes, [x, .013, .117], [.0095, .010, 1], [0, 0, 0], 'eye');
            piece(`pupil-${side}`, head, disc(), '#232b28', [x, .013, .118], [.0042, .0065, 1], [0, 0, 0], 'eye');
            piece(`eye-glint-${side}`, head, new THREE.CircleGeometry(1, 6), '#f4f1e6', [x - .003, .017, .119], [.0027, .0028, 1], [0, 0, 0], 'eye');
            lock(`eyelid-${side}`, head, [[x - .028, .014, .115], [x, .021, .118], [x + .027, .014, .115]], .0035, tint(skin, .74), 'skin', 4);
            lock(`brow-${side}`, head, [[x - .028, .041, .110], [x, .044, .116], [x + .027, .040, .109]], .0037, tint(hair, .91), 'hair', 4);
            if (elder)
                lock(`age-line-${side}`, head, [[x - .020, -.012, .116], [x, -.018, .119], [x + .020, -.013, .116]], .0018, tint(skin, .76), 'skin', 3);
        }
        piece('nose', head, orb(8, 4), tint(skin, 1.015), [0, -.037, .124], [.014, .028, .018], [.1, 0, 0], 'skin');
        lock('mouth', head, [[-.030, -.111, .105], [0, -.112, .110], [.030, -.111, .105]], .0028, tint(skin, .69), 'skin', 5);
        lock('lower-lip', head, [[-.020, -.116, .106], [0, -.117, .109], [.020, -.116, .106]], .002, tint(skin, .96), 'skin', 4);
        piece('hair', head, scalp(), hair, [0, .013, -.008], [.157, .189, .132], [0, 0, 0], 'hair');
        for (let i = 0; i < (role === 'guard' ? 0 : 6); i++) {
            const t = i / 5, sign = style % 2 ? -1 : 1, x = (-.11 + t * .19) * sign;
            lock(`hair-lock-${i}`, head, [[x * .45, .197, -.025], [x * .80, .184, .052], [x, .139, .113], [x - sign * .025, .077 + (i % 2) * .012, .119]], .023 + (i % 2) * .004, i % 3 ? tint(hair, .95) : tint(hair, 1.10));
        }
        if (role !== 'guard' && style === 1) {
            for (const sign of [-1, 1])
                lock(`hair-wave-${sign}`, head, [[sign * .125, .111, -.022], [sign * .160, -.010, -.009], [sign * .155, -.15, -.024], [sign * .13, -.255, -.049]], .037);
            piece('hair-back', head, form([[-.27, .12, .031], [-.09, .152, .049], [.10, .129, .037]], 12), tint(hair, .86), [0, 0, -.111], [1, 1, 1], [0, 0, 0], 'hair');
        }
        else if (role !== 'guard' && style === 2) {
            lock('hair-bun', head, [[0, .075, -.135], [.074, .115, -.19], [.035, .175, -.22], [-.048, .14, -.20], [-.04, .067, -.18], [.026, .054, -.166]], .039, tint(hair, .94), 'hair', 9);
        }
        else if (role !== 'guard' && style === 3) {
            for (let i = 0; i < 3; i++) {
                const a = i / 3 * Math.PI * 2;
                lock(`braid-${i}`, head, [[.09 + Math.cos(a) * .014, -.07, -.12], [.10 + Math.cos(a + 2) * .018, -.19, -.134 + Math.sin(a + 2) * .015], [.11 + Math.cos(a + 4) * .014, -.31, -.15], [.10, -.40, -.16]], .019, tint(hair, i === 1 ? 1.10 : .92), 'hair', 8);
            }
            piece('hair-tie', head, tube(), tint(outfit, .65), [.1, -.372, -.157], [.032, .029, .028]);
        }
        if (!female && (appearance.age ?? 22) >= 25 && seed % 3 === 0) {
            // Short groomed stubble follows the jaw instead of becoming a protruding block.
            lock('beard', head, [[-.095, -.105, .078], [-.066, -.16, .082], [0, -.182, .061], [.066, -.16, .082], [.095, -.105, .078]], .011, tint(hair, .92), 'hair', 9);
        }
        if (['smith', 'baker', 'miller', 'innkeeper'].includes(role)) {
            const color = role === 'smith' ? '#725038' : role === 'miller' ? '#c9c0a9' : linen;
            piece('profession-apron', body, form([[role === 'innkeeper' ? .32 : .62, .188, .011], [.97, .172, .013], [1.38, .122, .01]], 12), color, [0, 0, .145], [1, 1, 1], [0, 0, 0], role === 'smith' ? 'leather' : 'linen');
            piece('apron-pocket', body, form([[-.048, .062, .008], [.048, .067, .008]], 8), tint(color, .91), [0, 1.035, .164], [1, 1, 1], [0, 0, 0], role === 'smith' ? 'leather' : 'linen');
            for (const sign of [-1, 1])
                lock(`apron-strap-${sign}`, body, [[sign * .09, 1.37, .151], [sign * .10, 1.49, .112], [sign * .085, 1.56, .037]], .009, color, role === 'smith' ? 'leather' : 'linen', 4);
        }
        if (['merchant', 'traveler', 'courier', 'fisher', 'porter'].includes(role)) {
            const pack = role === 'porter';
            piece(pack ? 'porter-pack' : 'satchel', body, form([[-.17, .116, .08], [-.11, .140, .095], [.15, .123, .085], [.20, .09, .06]], 12), role === 'fisher' ? '#9d8852' : leather, [pack ? 0 : .225, pack ? 1.25 : 1.00, pack ? -.205 : .028], pack ? [1.25, 1.25, 1.1] : [1, 1, 1], [0, 0, -.06], 'leather');
            lock('shoulder-strap', body, [[-.20, 1.47, .082], [-.11, 1.33, .143], [.08, 1.15, .143], [.225, 1.04, .075]], .017, '#a18554', 'leather', 6);
            if (pack)
                piece('pack-bedroll', body, tube(), '#a89a73', [0, 1.57, -.21], [.079, .39, .079], [0, 0, Math.PI / 2], 'cloth');
        }
        if (['apostle', 'ranger', 'pilgrim', 'courier', 'traveler', 'matron'].includes(role)) {
            cape = joint('cape', body, 0, 1.54, -.107);
            const length = role === 'pilgrim' ? 1.05 : role === 'ranger' ? .89 : role === 'matron' ? .46 : role === 'courier' ? .54 : .74;
            piece('cape-cloth', cape, form([[-length, .272, .018], [-length + .045, .287, .020], [-.36, .246, .030], [-.10, .210, .042], [.025, .139, .026]], 14), tint(outfit, role === 'matron' ? 1.16 : .70), [0, 0, -.050]);
            piece('cloak-clasp', body, orb(8, 4), '#b7a16a', [.105, 1.48, .127], [.028, .027, .012], [0, 0, 0], 'metal');
        }
        if (['farmer', 'fisher', 'traveler'].includes(role)) {
            const straw = role === 'farmer' ? '#c5a66c' : role === 'fisher' ? '#82765b' : tint(outfit, .72);
            piece('hat-brim', head, tube(), straw, [0, .146, -.008], [role === 'farmer' ? .245 : .215, .021, .205], [0, 0, role === 'fisher' ? .07 : -.035], 'cloth');
            piece('hat-crown', head, form([[0, .157, .132], [.09, .137, .112], [.13, .085, .075]], 12), straw, [0, .151, -.012]);
            piece('hat-band', head, tube(), leather, [0, .173, -.012], [.155, .026, .13], [0, 0, 0], 'leather');
        }
        else if (['baker', 'miller', 'merchant', 'porter'].includes(role)) {
            const color = role === 'baker' ? linen : role === 'miller' ? '#c7c1ac' : tint(outfit, .78);
            piece('profession-cap', head, orb(12, 6), color, [role === 'merchant' ? .025 : 0, .17, -.016], [role === 'merchant' ? .180 : .165, role === 'baker' ? .078 : .061, .147], [0, 0, role === 'merchant' ? .13 : 0], role === 'baker' || role === 'miller' ? 'linen' : 'cloth');
            if (role === 'baker')
                piece('kerchief-knot', head, orb(8, 4), linen, [.132, .055, -.123], [.049, .030, .038], [0, 0, 0], 'linen');
        }
        else if (['ranger', 'pilgrim', 'matron'].includes(role)) {
            piece('hood-back', head, scalp(12, 5), role === 'matron' ? linen : tint(outfit, .72), [0, .015, -.020], [.172, .204, .148], [0, 0, 0], role === 'matron' ? 'linen' : 'cloth');
            for (const sign of [-1, 1])
                lock(`hood-piping-${sign}`, head, [[sign * .105, .175, .074], [sign * .166, .04, .056], [sign * .15, -.16, .012]], .009, role === 'matron' ? tint(linen, .85) : tint(outfit, 1.05), role === 'matron' ? 'linen' : 'cloth', 5);
        }
        if (role === 'guard') {
            piece('helmet', head, scalp(12, 5), iron, [0, .024, -.014], [.170, .207, .148], [0, 0, 0], 'metal');
            lock('helmet-rim', head, [[-.156, .060, .012], [-.11, .077, .119], [0, .09, .143], [.11, .077, .119], [.156, .060, .012]], .009, '#7c8a90', 'metal', 8);
            for (const [i, arm] of arms.entries())
                piece(`shoulder-armour-${i}`, arm, orb(10, 5), iron, [(i ? 1 : -1) * .015, -.013, 0], [.112, .071, .104], [0, 0, 0], 'metal');
            piece('guard-tabard', body, form([[.72, .132, .009], [1.43, .144, .010]], 12), tint(outfit, 1.22), [0, 0, .147]);
        }
        if (role === 'ranger')
            piece('quiver', body, form([[-.23, .055, .049], [.23, .063, .055]], 10), leather, [.16, 1.32, -.21], [1, 1, 1], [0, 0, -.18], 'leather');
        if (role === 'pilgrim')
            piece('pilgrim-scallop', body, orb(8, 4), linen, [.09, 1.42, .157], [.047, .041, .011], [0, 0, 0], 'linen');
        if (role === 'courier')
            lock('courier-scarf', body, [[.105, 1.55, .089], [.145, 1.40, .151], [.125, 1.25, .157]], .034, '#c69a60', 'cloth', 5);
    }
    else {
        piece('spine', body, tube(), '#b9b097', [0, 1.29, -.03], [.047, .50, .047]);
        piece('pelvis', body, form([[.94, .125, .086], [1.01, .173, .105], [1.11, .139, .085]], 10), bone);
        piece('collar-bones', body, tube(), bone, [0, 1.51, 0], [.033, .46, .038], [0, 0, Math.PI / 2]);
        for (let row = 0; row < 3; row++)
            for (const [side, sign] of [['left', -1], ['right', 1]] as const)
                piece(`rib-${side}-${row}`, body, form([[-.021, .105, .031], [.021, .10, .033]], 8), bone, [sign * .097, 1.43 - row * .115, .032], [1, 1, 1], [0, 0, -sign * .12]);
        piece('neck-bone', body, tube(), bone, [0, 1.66, 0], [.047, .17, .047]);
        piece('skull', head, form([[-.175, .104, .082], [-.05, .148, .115], [.11, .154, .123], [.185, .089, .067]], 12), bone);
        piece('jaw', head, form([[-.199, .091, .059], [-.14, .112, .069]], 10), '#bfb597', [0, 0, .054]);
        for (const [side, x] of [['left', -.061], ['right', .061]] as const) {
            piece(`eye-socket-${side}`, head, orb(8, 4), '#2c302b', [x, .035, .117], [.047, .049, .015]);
            piece(`iris-${side}`, head, disc(), '#c09154', [x, .035, .133], [.010, .016, 1], [0, 0, 0], 'eye');
        }
        piece('nasal-cavity', head, form([[-.021, .018, .006], [.021, .009, .004]], 6), '#49483a', [0, -.029, .125]);
        piece('teeth-line', head, form([[-.006, .080, .004], [.006, .078, .004]], 6), '#797461', [0, -.11, .128]);
        piece('shoulder-armour', arms[0], orb(8, 4), '#68716b', [0, -.025, 0], [.122, .083, .114], [0, 0, 0], 'metal');
    }
    const sword = joint('sword', elbows[1], 0, -.285, .030);
    sword.rotation.z = Math.PI;
    piece('sword-hilt', sword, tube(), leather, [0, .018, 0], [.024, .155, .024], [0, 0, 0], 'leather');
    piece('sword-guard', sword, form([[-.016, .102, .025], [.016, .102, .025]], 8), '#b7a069', [0, .11, 0], [1, 1, 1], [0, 0, 0], 'metal');
    piece('sword-blade', sword, form([[.13, .031, .011], [.60, .026, .010], [.68, .001, .001]], 8), iron, [0, 0, 0], [1, 1, 1], [0, 0, 0], 'metal');
    const tool = joint('work-tool', elbows[1], 0, -.285, .028);
    piece('tool-handle', tool, tube(), '#9a7447', [0, -.15, 0], [.025, .55, .025], [0, 0, 0], 'leather');
    piece('tool-pick-head', tool, form([[-.032, .205, .028], [.032, .18, .034]], 8), '#7c898b', [0, -.38, 0], [1, 1, 1], [0, 0, .15], 'metal');
    piece('tool-pick-point', tool, form([[0, .029, .032], [.15, .001, .001]], 8), iron, [.17, -.36, 0], [1, 1, 1], [0, 0, -Math.PI / 2], 'metal');
    sword.visible = false;
    tool.visible = false;
    for (const [parent, b] of batches) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geometry.userData.parts = b.parts;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${parent.name}-surface`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        geometries.push(geometry);
    }
    batches.clear();
    let equipped = false, workingNow = false, wasAttacking = false, attackStarted = 0, disposed = false;
    let gaitPhase = .72, lastAnimationTime: number | undefined;
    const equipment = () => { sword.visible = equipped && !workingNow; tool.visible = workingNow; };
    return { group, setLighting(daylight, indoors) { if (!disposed) surfaces.setLighting(daylight, indoors); }, setEquipment(value) { if (!disposed) {
            equipped = value;
            equipment();
        } }, animate(seconds, moving, working, attacking, speed) {
            if (disposed)
                return;
            const time = Number.isFinite(seconds) ? seconds : 0;
            const dt = lastAnimationTime === undefined ? 0 : Math.max(0, Math.min(.1, time - lastAnimationTime));
            lastAnimationTime = time;
            const travelSpeed = moving ? Number.isFinite(speed) ? Math.max(0, Math.min(12, speed!)) : 3 : 0;
            const running = THREE.MathUtils.clamp((travelSpeed - 2.2) / 4.6, 0, 1);
            if (moving) gaitPhase = (gaitPhase + dt * travelSpeed * Math.PI * 2 / (1.32 + running * 1.35)) % (Math.PI * 2);
            const wave = Math.sin(gaitPhase), stride = moving ? wave * (.32 + running * .27) : 0;
            legs[0].rotation.x = stride;
            legs[1].rotation.x = stride === 0 ? 0 : -stride;
            knees[0].rotation.x = moving ? Math.max(0, -wave) * (.30 + running * .36) : 0;
            knees[1].rotation.x = moving ? Math.max(0, wave) * (.30 + running * .36) : 0;
            arms[0].rotation.x = stride === 0 ? 0 : -stride * (.58 + running * .28);
            arms[1].rotation.x = stride * (.58 + running * .28);
            arms[0].rotation.z = .045;
            arms[1].rotation.z = -.045;
            elbows[0].rotation.x = -.09 - (moving ? running * .28 : 0);
            elbows[1].rotation.x = -.09 - (moving ? running * .28 : 0);
            body.rotation.y = moving ? wave * .025 : 0;
            body.rotation.z = 0;
            head.rotation.y = Math.sin(time * .73 + phase) * .027;
            head.rotation.z = Math.sin(time * .59 + phase) * .008;
            head.position.y = 1.879 + Math.sin(time * 1.7 + phase) * .002;
            if (cape)
                cape.rotation.x = moving ? -.035 + Math.sin(gaitPhase + .6) * (.031 + running * .018) : Math.sin(time * 1.2 + phase) * .007;
            workingNow = working && !attacking;
            if (workingNow) {
                arms[1].rotation.x = -1.38 + Math.sin(time * 5.8) * .66;
                elbows[1].rotation.x = -.20;
                arms[1].rotation.z = -.1;
                arms[0].rotation.x = -.65 + Math.sin(time * 5.8) * .17;
            }
            if (attacking) {
                if (!wasAttacking)
                    attackStarted = time;
                const progress = THREE.MathUtils.clamp((time - attackStarted) / .28, 0, 1);
                arms[1].rotation.x = -2.35 + progress * 1.95;
                arms[1].rotation.z = -.25 + Math.sin(progress * Math.PI) * .40;
                elbows[1].rotation.x = -.16;
                arms[0].rotation.x = -.45;
                body.rotation.y = -.18 + progress * .36;
            }
            // Analytical sole support keeps one foot planted; posing never changes the simulation root.
            const minFoot = (hip: number, knee: number) => Math.min(...[-.11, .17].map(z => 1 - .48 * Math.cos(hip) - .52 * Math.cos(hip + knee) - z * Math.sin(hip + knee)));
            body.position.y = -Math.min(minFoot(legs[0].rotation.x, knees[0].rotation.x), minFoot(legs[1].rotation.x, knees[1].rotation.x));
            wasAttacking = attacking;
            equipment();
        }, dispose() { if (disposed)
            return; disposed = true; geometries.forEach(g => g.dispose()); geometries.length = 0; surfaces.dispose(); group.clear(); } };
}

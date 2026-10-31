import * as THREE from "three";
import { store } from "../simulation";
import { activeAutonomy, blockedWorldInput, worldInput } from "../world-input";
import { objectsForZone, regionForZone } from "../regions";
import { estateBuildings } from "../territory-data";
import { findPath, nearestWalkable, objectApproach, type NavigationContext, type Point } from "../navigation";
import type { Dialog, Zone } from "../types";
import { createCharacterModel, type ActorAppearance, type CharacterModel } from "./characters";
import { createRegionEnvironment, type RegionEnvironment } from "./environment";
import { WorldEffects } from "./effects";
import { weatherFor } from "../weather";
import { WeatherLayer, atmosphereFor } from "./weather";
import { LightningLayer } from "./lightning";
import { AmbienceLayer } from "./ambience";
import { GrassField } from "./grass";
import { FrameBudget, PostProcessing, SkyEnvironment, postQualityFor } from "./realism";
import { clampPitch, FIRST_PERSON_EYE, FIRST_PERSON_FOV, FIRST_PERSON_HUMAN_SCALE, loadViewMode, presentation, saveViewMode, yawFromDirection, type ViewMode } from "./presentation";
import { npcVisualIdentity } from "../character-identity";
import { CharacterGrounding } from "./character-grounding";
import { createWildlifeLayer } from "./wildlife";
import { animalsForZone } from "../wildlife";
import { cameraChange, cameraFraming, DEFAULT_CAMERA_DISTANCE, DEFAULT_CAMERA_YAW, screenToMap, toMap, toWorld, WORLD_SCALE } from "./coordinates";

type Actor = { model: CharacterModel; label: HTMLDivElement; x: number; y: number; lastTime: number; appearance: string };
type Destination = { point: Point; path: Point[]; id?: string };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const SHADOW_EXTENT = 34;

class ThreeWorld {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, .1, 230);
  private environment?: RegionEnvironment;
  private effects = new WorldEffects();
  private weather = new WeatherLayer();
  private lightning = new LightningLayer();
  private ambience = new AmbienceLayer();
  private grass = new GrassField();
  private ambienceDay = 1;
  private mode: ViewMode = loadViewMode();
  private pitch = -.05;
  private bob = 0;
  private lastEye = new THREE.Vector3();
  private look: { id: number; x: number; y: number; startX: number; startY: number; time: number; moved: boolean } | null = null;
  private skyEnvironment?: SkyEnvironment;
  private post?: PostProcessing;
  private budget = new FrameBudget();
  private sunDirection = new THREE.Vector3(0, 1, 0);
  private ambienceWet = 0;
  private grounding = new CharacterGrounding();
  private wildlife = createWildlifeLayer();
  private presentationTime = 0;
  private actors = new Map<string, Actor>();
  private layer = document.createElement("div");
  private labels = document.createElement("div");
  private prompt = document.createElement("button");
  private haloGeometry = new THREE.RingGeometry(.43, .49, 32);
  private haloMaterial = new THREE.MeshBasicMaterial({ color: 0xe7cc83, transparent: true, opacity: .48, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  private routeGeometry = new THREE.BufferGeometry();
  private routeMaterial = new THREE.LineBasicMaterial({ color: 0xf0d89a, transparent: true, opacity: .85, depthTest: false });
  private routeLine = new THREE.Line(this.routeGeometry, this.routeMaterial);
  private ambient = new THREE.HemisphereLight(0xfff2d6, 0x5c7558, 2.1);
  private sunlight = new THREE.DirectionalLight(0xffebc0, 2.2);
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private vector = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private desiredFocus = new THREE.Vector3();
  private view = { yaw: DEFAULT_CAMERA_YAW, distance: DEFAULT_CAMERA_DISTANCE };
  private pressed = new Set<string>();
  private zone: Zone | null = null;
  private scenic = true;
  private disposed = false;
  private contextAvailable = true;
  private frameId = 0;
  private lastFrame = performance.now();
  private attackUntil = 0;
  private attackLast = -1;
  private destination: Destination | null = null;
  private animalPursuit = 0;
  private blockedFor = 0;
  private geometrySignature = "";
  private lastLabels = 0;
  private lastDebug = 0;
  private observer: ResizeObserver;

  constructor(private element: HTMLElement, private renderer: THREE.WebGLRenderer) {
    this.layer.className = "world-three-layer";
    this.layer.dataset.renderer = "3d";
    this.labels.className = "world-three-labels";
    this.prompt.className = "world-three-interact";
    this.prompt.type = "button";
    this.prompt.hidden = true;
    this.prompt.addEventListener("click", this.promptClick);
    this.layer.append(renderer.domElement, this.labels, this.prompt);
    renderer.domElement.className = "world-three-canvas";
    renderer.domElement.dataset.renderer = "3d";
    renderer.domElement.setAttribute("aria-label", "Mundo 3D de Kingdom Gods. Use WASD ou o joystick para caminhar.");
    renderer.domElement.style.touchAction = "none";
    this.observer = new ResizeObserver(this.resize);
  }

  start(): void {
    this.element.append(this.layer);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    // Buildings, trees and props use a soft sun shadow map that follows the camera focus.
    // Characters keep their batched contact and silhouette layer, so they do not cast a second shadow.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sunlight.castShadow = true;
    const coarse = matchMedia("(pointer: coarse)").matches;
    this.sunlight.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const shadowCamera = this.sunlight.shadow.camera;
    shadowCamera.left = -SHADOW_EXTENT; shadowCamera.right = SHADOW_EXTENT;
    shadowCamera.top = SHADOW_EXTENT; shadowCamera.bottom = -SHADOW_EXTENT;
    shadowCamera.near = 1; shadowCamera.far = 140;
    shadowCamera.updateProjectionMatrix();
    this.sunlight.shadow.bias = -0.0004;
    this.sunlight.shadow.normalBias = 0.035;
    this.sunlight.shadow.radius = 3;
    this.scene.background = new THREE.Color(0xb7c8b3);
    this.scene.fog = new THREE.Fog(0xb7c8b3, 65, 155);
    this.scene.add(this.ambient, this.sunlight, this.sunlight.target, this.routeLine, this.effects.group, this.weather.group, this.lightning.group, this.ambience.group, this.grass.mesh, this.wildlife.group, this.grounding.group);
    this.routeLine.frustumCulled = false;
    this.routeLine.renderOrder = 5;
    const width = Math.max(1, this.element.clientWidth);
    this.skyEnvironment = new SkyEnvironment(this.renderer);
    const quality = postQualityFor(matchMedia("(pointer: coarse)").matches, width, location.search);
    if (quality.enabled) this.post = new PostProcessing(this.renderer, this.scene, this.camera, quality);
    presentation.firstPerson = this.mode === "first";
    this.observer.observe(this.element);
    this.resize();
    // Build and draw once while the lifecycle can still catch a mount failure.
    const scenic = store.state.phase === "title" || store.state.phase === "creation";
    this.rebuild(scenic ? "village" : store.state.zone, scenic);
    this.updateCamera(.016);
    this.draw();
    this.lastFrame = performance.now();
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.release);
    document.addEventListener("visibilitychange", this.visibility);
    document.addEventListener("kg-navigate", this.navigate);
    document.addEventListener("kg-camera", this.changeCamera);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.addEventListener("pointercancel", this.pointerUp);
    document.addEventListener("mousemove", this.mouseLook);
    document.addEventListener("pointerlockchange", this.lockChange);
    this.renderer.domElement.addEventListener("wheel", this.wheel, { passive: false });
    this.renderer.domElement.addEventListener("contextmenu", this.contextMenu);
    this.renderer.domElement.addEventListener("webglcontextlost", this.contextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.contextRestored);
    worldInput.attack = this.attack;
    worldInput.interact = () => this.interact();
    worldInput.dodge = this.dodge;
    this.frameId = requestAnimationFrame(this.frame);
    this.announceMode();
  }

  private draw(): void {
    if (this.post) this.post.render(); else this.renderer.render(this.scene, this.camera);
  }
  private firstPerson(): boolean { return this.mode === "first" && !this.scenic && store.state.phase === "playing"; }
  private announceMode(): void {
    window.dispatchEvent(new CustomEvent("kg-view-mode", { detail: { mode: this.mode, locked: document.pointerLockElement === this.renderer.domElement } }));
  }
  private setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode; saveViewMode(mode);
    presentation.firstPerson = mode === "first";
    if (mode === "first") {
      // Look the way the apostle was facing.
      this.view.yaw = this.actors.get("player")?.model.group.rotation.y ?? this.view.yaw;
      this.view.yaw = this.view.yaw + Math.PI; this.pitch = -.05;
    } else if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.clearRoute();
    for (const [id, actor] of this.actors) this.applyActorPresentation(id, actor);
    this.resize();
    this.announceMode();
  }
  private applyActorPresentation(id: string, actor: Actor): void {
    const first = this.mode === "first";
    actor.model.group.scale.setScalar(first ? FIRST_PERSON_HUMAN_SCALE : 1);
    if (id === "player") actor.model.group.visible = !first || this.scenic;
  }
  private lockChange = () => this.announceMode();
  private mouseLook = (event: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement || !this.firstPerson()) return;
    this.turn(event.movementX * .0024, event.movementY * .0024);
  };
  private turn(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.view.yaw -= dx;
    if (this.view.yaw > Math.PI) this.view.yaw -= Math.PI * 2;
    if (this.view.yaw < -Math.PI) this.view.yaw += Math.PI * 2;
    this.pitch = clampPitch(this.pitch - dy);
  }
  private pointerMove = (event: PointerEvent) => {
    if (!this.look || event.pointerId !== this.look.id) return;
    const dx = event.clientX - this.look.x, dy = event.clientY - this.look.y;
    this.look.x = event.clientX; this.look.y = event.clientY;
    if (Math.hypot(event.clientX - this.look.startX, event.clientY - this.look.startY) > 8) this.look.moved = true;
    if (this.look.moved) this.turn(dx * .0055, dy * .0045);
  };
  private pointerUp = (event: PointerEvent) => {
    if (!this.look || event.pointerId !== this.look.id) return;
    const tap = !this.look.moved && performance.now() - this.look.time < 350;
    this.look = null;
    if (tap) this.useAt(event.clientX, event.clientY);
  };
  /** First-person "use": the person, animal or place under the crosshair (or tap), if within reach. */
  private useAt(clientX: number, clientY: number): void {
    if (!this.canAct()) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const targets = [this.wildlife.group, ...[...this.actors.entries()].filter(([id]) => id !== "player").map(([, actor]) => actor.model.group)];
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    let selected: THREE.Object3D | null = hit?.object ?? null;
    while (selected && !selected.userData.actorId && !selected.userData.animalId) selected = selected.parent;
    const reach = (point: Point) => distance(point, store.state.apostle) <= 150;
    if (selected?.userData.animalId) {
      const animal = animalsForZone(store.state, store.state.zone).find(candidate => candidate.id === selected!.userData.animalId);
      if (animal && reach(animal)) { this.interact(`animal:${animal.id}`); return; }
    }
    if (selected?.userData.actorId) {
      const npc = store.state.npcs.find(person => person.id === selected!.userData.actorId);
      if (npc && reach(npc)) { this.interact(npc.id); return; }
      if (npc && npc.id.startsWith("enemy")) { this.attack(); return; }
    }
    if (store.state.zone === "dungeon") { this.attack(); return; }
    const nearest = store.getNearest();
    if (nearest && nearest.distance <= 150) this.interact();
  }

  private canAct(): boolean { return !this.disposed && this.contextAvailable && store.state.phase === "playing" && !blockedWorldInput() && !document.hidden; }
  private context(): NavigationContext { return { zone: store.state.zone, building: store.state.property.building, estates: estateBuildings(store.state) }; }
  private release = () => { this.pressed.clear(); worldInput.x = worldInput.y = 0; };
  private visibility = () => { this.release(); this.lastFrame = performance.now(); };
  private contextMenu = (event: Event) => event.preventDefault();
  private contextLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed) return;
    this.contextAvailable = false;
    this.effects.dispose();
    this.release();
    window.dispatchEvent(new CustomEvent("kg-renderer-failure", { detail: { message: "O navegador interrompeu o visual 3D. Sua campanha foi preservada. Use Tentar novamente para retomar." } }));
  };
  private contextRestored = () => {
    this.contextAvailable = true;
    this.lastFrame = performance.now();
    window.dispatchEvent(new CustomEvent("kg-renderer-status", { detail: { mode: "3d", message: "" } }));
  };
  private resize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.element.clientWidth), height = Math.max(1, this.element.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 900 ? 1.25 : 1.5));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const first = this.mode === "first" && !this.scenic && store.state.phase === "playing";
    this.camera.fov = first ? (width < 600 ? FIRST_PERSON_FOV + 6 : FIRST_PERSON_FOV) : width < 600 ? 48 : height < 500 ? 48 : 42;
    this.camera.near = first ? .05 : .1; this.camera.far = first ? 600 : 230;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(width, height, this.renderer.getPixelRatio());
    this.effects.setProjection(height, this.renderer.getPixelRatio(), this.camera.fov);
  };

  private keyDown = (event: KeyboardEvent) => {
    if (!this.canAct()) return;
    const movement = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"];
    if (movement.includes(event.code)) { event.preventDefault(); this.pressed.add(event.code); }
    if (event.repeat) return;
    if (event.code === "KeyE") { event.preventDefault(); this.interact(); }
    if (event.code === "KeyV") { event.preventDefault(); this.setMode(this.mode === "first" ? "third" : "first"); }
    if (event.code === "Space") this.attack();
    if (event.code.startsWith("Shift")) this.dodge();
    if (event.code === "KeyZ" || event.code === "KeyX") {
      event.preventDefault(); this.setCamera(event.code === "KeyZ" ? "left" : "right");
    }
  };
  private keyUp = (event: KeyboardEvent) => this.pressed.delete(event.code);
  private wheel = (event: WheelEvent) => { if (this.firstPerson()) return; if (!blockedWorldInput()) { event.preventDefault(); this.setCamera(event.deltaY > 0 ? "out" : "in"); } };
  private changeCamera = (event: Event) => {
    const action = (event as CustomEvent<{ action?: string }>).detail?.action;
    if (action === "toggle-view") { this.setMode(this.mode === "first" ? "third" : "first"); return; }
    if (action && !blockedWorldInput()) this.setCamera(action);
  };
  private setCamera(action: string): void {
    const yaw = action === "character" ? this.actors.get("player")?.model.group.rotation.y ?? this.view.yaw : this.view.yaw;
    this.view = cameraChange(yaw, this.view.distance, action);
  };

  private interact(id?: string): void {
    if (!this.canAct()) return;
    this.clearRoute();
    const nearest = store.getNearest();
    if (!id && (!nearest || nearest.distance > 150)) { store.notify("Aproxime-se de alguém ou de um lugar para interagir."); return; }
    const dialog: Dialog | null = store.interact(id || nearest!.id);
    if (dialog) document.dispatchEvent(new CustomEvent("kg-interact", { detail: dialog }));
  }
  private promptClick = () => this.interact();
  private attack = () => {
    if (!this.canAct()) return;
    this.clearRoute();
    const now = performance.now() / 1000;
    if (now - this.attackLast < .3) return;
    this.attackLast = now;
    const stamina = store.state.apostle.stamina;
    store.attack();
    this.effects.observePlayerAttack(store.state, stamina, this.actors.get("player")?.model.group.rotation.y ?? 0);
    if (stamina - store.state.apostle.stamina >= 9.999) this.attackUntil = this.presentationTime + .28;
  };
  private dodge = () => {
    if (!this.canAct()) return;
    this.clearRoute();
    const stamina = store.state.apostle.stamina;
    store.dodge();
    if (store.state.apostle.stamina >= stamina) return;
    const input = this.inputDirection();
    const vector = Math.hypot(input.x, input.y) > .05 ? input : screenToMap(0, 1, this.view.yaw);
    store.move(vector.x, vector.y, .36);
  };
  private inputDirection(): Point {
    const down = (first: string, second: string) => this.pressed.has(first) || this.pressed.has(second) ? 1 : 0;
    return screenToMap(down("KeyD", "ArrowRight") - down("KeyA", "ArrowLeft") + worldInput.x,
      down("KeyS", "ArrowDown") - down("KeyW", "ArrowUp") + worldInput.y, this.view.yaw);
  }

  private navigate = (event: Event) => {
    if (store.state.phase !== "playing") return;
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (!id || !objectsForZone(store.state.zone).some(object => object.id === id)) return;
    this.release();
    this.planRoute(objectApproach(id, this.context()));
  };
  private clearRoute(): void { this.destination = null; this.animalPursuit = 0; this.blockedFor = 0; this.routeLine.visible = false; }
  private planRoute(point: Point, id?: string): void {
    const goal = nearestWalkable(point, this.context());
    if (distance(goal, store.state.apostle) < 1) { this.clearRoute(); if (id) this.interact(id); return; }
    const path = findPath(store.state.apostle, goal, this.context());
    if (!path.length) { this.clearRoute(); store.notify("Não há um caminho livre até esse lugar. Escolha outro acesso."); return; }
    if (id !== this.destination?.id) this.animalPursuit = 0;
    this.destination = { point: goal, path, id }; this.blockedFor = 0;
    this.drawRoute();
  }
  private drawRoute(): void {
    if (!this.destination) return;
    const points = [store.state.apostle, ...this.destination.path].map(point => new THREE.Vector3(point.x * WORLD_SCALE, .06, point.y * WORLD_SCALE));
    this.routeGeometry.dispose(); this.routeGeometry = new THREE.BufferGeometry().setFromPoints(points); this.routeLine.geometry = this.routeGeometry;
    this.routeLine.visible = true;
  }
  private pointerDown = (event: PointerEvent) => {
    if (!this.canAct()) return;
    if (event.button === 2) { event.preventDefault(); this.attack(); return; }
    if (this.firstPerson()) {
      if (event.pointerType === "mouse") {
        if (event.button !== 0) return;
        if (document.pointerLockElement !== this.renderer.domElement) {
          // The first click captures the mouse for looking; it does not act.
          const request = this.renderer.domElement.requestPointerLock?.() as Promise<void> | undefined;
          request?.catch?.(() => {});
          return;
        }
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.useAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        this.look = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, time: performance.now(), moved: false };
        this.renderer.domElement.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    if (event.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    // Read actual model hits before projecting on the floor, so roofs and actors can be selected.
    const targets = [this.environment?.group, this.wildlife.group, ...[...this.actors.values()].map(actor => actor.model.group)].filter((target): target is THREE.Group => !!target);
    const hits = this.raycaster.intersectObjects(targets, true);
    let point: Point | null = null;
    if (hits[0]) {
      let selected: THREE.Object3D | null = hits[0].object;
      while (selected && !selected.userData.actorId && !selected.userData.animalId) selected = selected.parent;
      if (selected?.userData.animalId) {
        const animal = animalsForZone(store.state, store.state.zone).find(animal => animal.id === selected!.userData.animalId);
        if (animal) {
          const id = `animal:${animal.id}`;
          if (distance(animal, store.state.apostle) <= 130) this.interact(id);
          else this.planRoute({ x: animal.x, y: animal.y + 20 }, id);
          return;
        }
      }
      if (selected?.userData.actorId && selected.userData.actorId !== "player") {
        const npc = store.state.npcs.find(person => person.id === selected!.userData.actorId);
        if (npc) { this.planRoute(nearestWalkable({ x: npc.x, y: npc.y + 35 }, this.context()), npc.id); return; }
      }
      point = toMap(hits[0].point);
    }
    if (!point && this.raycaster.ray.intersectPlane(this.ground, this.vector)) point = toMap(this.vector);
    if (!point) return;
    if (store.state.zone === "village" && store.state.property.building && point.x >= 2010 && point.x <= 2170 && point.y >= 680 && point.y <= 810) {
      this.planRoute({ x: 2090, y: 815 }, "farmhouse"); return;
    }
    const candidate = objectsForZone(store.state.zone).map(object => ({ object, range: distance(point!, object) }))
      .filter(({ object, range }) => range <= Math.max(40, Math.min(110, (object.w ?? 75) / 2)))
      .sort((a, b) => a.range - b.range)[0];
    if (candidate) this.planRoute(objectApproach(candidate.object.id, this.context()), candidate.object.id);
    else this.planRoute(point);
  };

  private move(dt: number): void {
    const apostle = store.state.apostle;
    if (this.destination && (store.state.frontier.work || activeAutonomy(store.state))) this.clearRoute();
    let input = this.inputDirection();
    if (Math.hypot(input.x, input.y) > .05) this.clearRoute();
    let movementDt = dt;
    if (this.destination) {
      const animalId = this.destination.id?.startsWith("animal:") ? this.destination.id.slice(7) : undefined;
      if (animalId) {
        this.animalPursuit += dt;
        const animal = animalsForZone(store.state, store.state.zone).find(animal => animal.id === animalId);
        if (!animal) this.clearRoute();
        else if (distance(animal, apostle) <= 130) this.interact(`animal:${animal.id}`);
        else if (this.animalPursuit >= 12) { this.clearRoute(); store.notify("O animal se afastou. Aproxime-se e tente novamente."); }
        else if (distance(animal, this.destination!.point) > 60) this.planRoute({ x: animal.x, y: animal.y + 20 }, `animal:${animal.id}`);
      }
      const npc = store.state.npcs.find(person => person.id === this.destination?.id);
      if (npc && npc.zone !== store.state.zone) { this.clearRoute(); store.notify(`${npc.name} entrou em outro ambiente. Siga pela porta para encontrá-lo.`); }
      else if (npc && this.destination && distance(npc, this.destination.point) > 75) this.planRoute({ x: npc.x, y: npc.y + 35 }, npc.id);
      while (this.destination?.path.length && distance(this.destination.path[0], apostle) < 1) this.destination.path.shift();
      if (this.destination && !this.destination.path.length) { const id = this.destination.id; this.clearRoute(); if (id) this.interact(id); }
      const waypoint = this.destination?.path[0];
      if (waypoint) { input = { x: waypoint.x - apostle.x, y: waypoint.y - apostle.y }; movementDt = Math.min(dt, Math.hypot(input.x, input.y) / (apostle.age < 16 ? 130 : 170)); }
    }
    if (Math.hypot(input.x, input.y) > .05) {
      const before = { x: apostle.x, y: apostle.y };
      store.move(input.x, input.y, movementDt);
      if (this.destination) {
        this.blockedFor = distance(before, apostle) < .02 ? this.blockedFor + dt : 0;
        if (this.blockedFor > 1.2) this.planRoute(this.destination.point, this.destination.id);
      }
    }
  }

  private rebuild(zone: Zone, scenic: boolean): void {
    this.clearRoute();
    this.effects.reset(store.state);
    if (this.environment) { this.scene.remove(this.environment.group); this.environment.dispose(); }
    for (const actor of this.actors.values()) { this.scene.remove(actor.model.group); actor.model.dispose(); actor.label.remove(); }
    this.actors.clear();
    this.zone = zone; this.scenic = scenic;
    this.environment = createRegionEnvironment(zone, store.state);
    this.scene.add(this.environment.group);
    this.wildlife.update(store.state, zone, this.presentationTime);
    this.renderer.domElement.dataset.region = zone;
    const point = toWorld(scenic ? { x: 1270, y: 880 } : store.state.apostle);
    this.focus.set(point.x, .7, point.z);
    this.syncActors(this.presentationTime);
  }
  private actor(id: string, appearance: ActorAppearance, kind: "human" | "skeleton" = "human"): Actor {
    const signature = `${appearance.skin}:${appearance.hair}:${appearance.eyes}:${appearance.outfit}:${kind}:${appearance.role ?? ""}:${appearance.sex ?? ""}:${appearance.age ?? ""}:${appearance.variant ?? ""}`;
    let actor = this.actors.get(id);
    if (actor && actor.appearance !== signature) { this.scene.remove(actor.model.group); actor.model.dispose(); actor.label.remove(); this.actors.delete(id); actor = undefined; }
    if (!actor) {
      const model = createCharacterModel(appearance, kind);
      model.group.userData.actorId = id;
      // Characters already have soft contact/silhouette shadows in CharacterGrounding.
      model.group.traverse(child => { if ((child as THREE.Mesh).isMesh) { child.castShadow = false; } });
      if (this.mode === "first") model.group.scale.setScalar(FIRST_PERSON_HUMAN_SCALE);
      if (id === "player" && this.mode === "first" && !this.scenic) model.group.visible = false;
      const label = document.createElement("div");
      label.className = `world-three-label ${id === "player" ? "player" : kind === "skeleton" ? "enemy" : "npc"}`;
      this.labels.append(label);
      if (id === "player") { const halo = new THREE.Mesh(this.haloGeometry, this.haloMaterial); halo.rotation.x = -Math.PI / 2; halo.position.y = .035; halo.renderOrder = 4; model.group.add(halo); }
      this.scene.add(model.group);
      actor = { model, label, x: NaN, y: NaN, lastTime: NaN, appearance: signature };
      this.actors.set(id, actor);
    }
    return actor;
  }
  private placeActor(id: string, point: Point, appearance: ActorAppearance, name: string, time: number, kind: "human" | "skeleton" = "human", equipped = false): void {
    const actor = this.actor(id, appearance, kind);
    const dx = point.x - actor.x, dy = point.y - actor.y;
    const travelled = Math.hypot(dx, dy), elapsed = time - actor.lastTime;
    // Zone transfers and restored saves are discontinuities, not a sprint.
    const moving = Number.isFinite(travelled) && travelled > .02 && travelled < 85 && elapsed > 0;
    const speed = moving ? travelled * WORLD_SCALE / elapsed : 0;
    if (moving) actor.model.group.rotation.y = Math.atan2(dx, dy);
    const world = toWorld(point);
    const bridge = this.zone === "village" && point.x >= 285 && point.x <= 485 && point.y >= 856 && point.y <= 930;
    actor.model.group.position.set(world.x, bridge ? .23 : 0, world.z);
    const player = id === "player";
    actor.model.setEquipment(equipped);
    actor.model.animate(time, moving, player && !!store.state.frontier.work,
      player ? time < this.attackUntil : kind === "skeleton" && distance(point, store.state.apostle) < 65 && time % 1 < .23, speed);
    actor.label.textContent = name;
    actor.label.dataset.actorId = id;
    actor.x = point.x; actor.y = point.y; actor.lastTime = time;
  }
  private syncActors(time: number): void {
    const state = store.state;
    const living = new Set<string>();
    if (!this.scenic && state.apostle.alive) {
      this.placeActor("player", state.apostle, { ...state.apostle, role: "apostle", variant: state.apostle.id }, state.apostle.name, time, "human", state.apostle.equipment === "sword"); living.add("player");
    }
    const npcs = state.npcs.filter(npc => npc.zone === this.zone);
    for (const npc of npcs) {
      const relative = state.family.find(person => person.id === npc.id);
      if (relative?.alive === false || (!this.scenic && npc.id === state.apostle.id)) continue;
      const appearance: ActorAppearance = npcVisualIdentity(state, npc);
      this.placeActor(npc.id, npc, appearance, npc.name, time); living.add(npc.id);
    }
    if (this.zone === "dungeon") for (const enemy of state.enemies.filter(enemy => enemy.alive)) {
      this.placeActor(enemy.id, enemy, { skin: "#d7cfb2", hair: "#d7cfb2", eyes: "#bf8b54", outfit: "#6a6c60" }, `Esqueleto · ${Math.ceil(enemy.hp)}`, time, "skeleton", true); living.add(enemy.id);
    }
    for (const [id, actor] of this.actors) if (!living.has(id)) { this.scene.remove(actor.model.group); actor.model.dispose(); actor.label.remove(); this.actors.delete(id); }
  }

  private project(point: THREE.Vector3): { x: number; y: number; visible: boolean } {
    this.vector.copy(point).project(this.camera);
    return { x: (this.vector.x + 1) / 2 * this.element.clientWidth, y: (1 - this.vector.y) / 2 * this.element.clientHeight,
      visible: this.vector.z >= -1 && this.vector.z <= 1 && Math.abs(this.vector.x) < .96 && Math.abs(this.vector.y) < .95 };
  }
  private updateLabels(): void {
    const active = !this.scenic && store.state.phase === "playing" && !blockedWorldInput();
    const nearest = active ? store.getNearest() : null;
    const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
    // Keep the apostle and the interaction target readable when a crowd meets.
    const actors = [...this.actors].sort(([aId, a], [bId, b]) => {
      const priority = (id: string, actor: Actor) => id === "player" ? -2 :
        id === nearest?.id ? -1 : distance(actor, store.state.apostle);
      return priority(aId, a) - priority(bId, b);
    });
    for (const [id, actor] of actors) {
      const point = actor.model.group.position.clone(); point.y += 2.55 * actor.model.group.scale.y;
      if (id === "player" && this.firstPerson()) { actor.label.hidden = true; continue; }
      const screen = this.project(point);
      const close = id === "player" || distance(actor, store.state.apostle) < 430;
      actor.label.hidden = !active || !screen.visible || !close;
      if (actor.label.hidden) continue;
      // Estimate text width without synchronous layout reads in the render loop.
      const halfWidth = Math.min(145, (actor.label.textContent?.length ?? 0) * 6 + 16) / 2;
      let labelY = screen.y, placed = false;
      for (let row = 0; row < 3; row++) {
        labelY = screen.y - row * 21;
        const box = { left: screen.x - halfWidth - 3, right: screen.x + halfWidth + 3,
          top: labelY - 20, bottom: labelY + 2 };
        if (box.top < 0 || occupied.some(other => box.left < other.right && box.right > other.left &&
          box.top < other.bottom && box.bottom > other.top)) continue;
        occupied.push(box); placed = true; break;
      }
      actor.label.hidden = !placed;
      actor.label.style.transform = `translate(${screen.x}px,${labelY}px) translate(-50%,-100%)`;
    }
    this.prompt.hidden = !nearest || nearest.distance > 150;
    if (nearest && !this.prompt.hidden) {
      // Anchored under the apostle's own feet: it never covers the player, and the
      // target stays visible above it with its name label.
      const world = toWorld(store.state.apostle);
      const screen = this.project(new THREE.Vector3(world.x, 0, world.z));
      this.prompt.hidden = !screen.visible;
      this.prompt.textContent = `E · ${nearest.label}`;
      this.prompt.style.transform = `translate(${screen.x}px,${screen.y + 16}px) translate(-50%,0)`;
    }
  }
  private updateCamera(dt: number): void {
    const wantsFirst = this.mode === "first" && !this.scenic && store.state.phase === "playing";
    if (wantsFirst !== (this.camera.near < .08)) this.resize();
    if (wantsFirst) this.updateFirstPersonCamera(dt);
    else this.updateThirdPersonCamera(dt);
    this.updateLighting();
  }
  private updateFirstPersonCamera(dt: number): void {
    const apostle = toWorld(store.state.apostle);
    const eye = new THREE.Vector3(apostle.x, 0, apostle.z);
    // Auto-walk along a planned route turns the view toward the path.
    const waypoint = this.destination?.path[0];
    if (waypoint) {
      const target = yawFromDirection(waypoint.x - store.state.apostle.x, waypoint.y - store.state.apostle.y);
      let delta = target - this.view.yaw;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.view.yaw += delta * (1 - Math.exp(-dt * 4));
    }
    const travelled = Math.hypot(eye.x - this.lastEye.x, eye.z - this.lastEye.z);
    this.lastEye.copy(eye);
    if (travelled > .0005 && travelled < 2) this.bob += travelled * 2.6; else this.bob *= .9;
    const bobHeight = Math.sin(this.bob) * .035, bobSide = Math.cos(this.bob * .5) * .018;
    eye.y = FIRST_PERSON_EYE + bobHeight;
    const right = new THREE.Vector3(Math.cos(this.view.yaw), 0, -Math.sin(this.view.yaw));
    eye.addScaledVector(right, bobSide);
    this.camera.position.copy(eye);
    const cosPitch = Math.cos(this.pitch);
    this.vector.set(eye.x - Math.sin(this.view.yaw) * cosPitch, eye.y + Math.sin(this.pitch), eye.z - Math.cos(this.view.yaw) * cosPitch);
    this.camera.lookAt(this.vector);
    this.camera.updateMatrixWorld();
    this.focus.set(apostle.x, .7, apostle.z);
    if (document.pointerLockElement === this.renderer.domElement && blockedWorldInput()) document.exitPointerLock();
  }
  private updateThirdPersonCamera(dt: number): void {
    const point = toWorld(this.scenic ? { x: 1270, y: 880 } : store.state.apostle);
    const framing = cameraFraming(this.scenic ? 47 : this.view.distance);
    this.desiredFocus.set(point.x, framing.focusHeight, point.z);
    this.focus.lerp(this.desiredFocus, 1 - Math.exp(-dt * 9));
    const viewDistance = this.scenic ? 47 : this.view.distance;
    const yaw = this.scenic ? .25 : this.view.yaw;
    this.camera.position.set(this.focus.x + Math.sin(yaw) * viewDistance * framing.horizontalFactor,
      this.focus.y + viewDistance * framing.heightFactor, this.focus.z + Math.cos(yaw) * viewDistance * framing.horizontalFactor);
    this.camera.lookAt(this.focus);
    this.camera.updateMatrixWorld();
  }
  private updateLighting(): void {
    // Snap the shadow frustum to its texel grid so shadows do not shimmer while walking.
    const texel = (SHADOW_EXTENT * 2) / this.sunlight.shadow.mapSize.x;
    // In first person the shadow box sits ahead of the eye, where the player looks.
    const ahead = this.firstPerson() ? SHADOW_EXTENT * .55 : 0;
    const cx = this.focus.x - Math.sin(this.view.yaw) * ahead, cz = this.focus.z - Math.cos(this.view.yaw) * ahead;
    const sx = Math.round(cx / texel) * texel, sz = Math.round(cz / texel) * texel;
    // The key light follows the real sun (or the moon at night), never dipping below a low evening angle.
    const angle = (((store.state.minutes % 1440) + 1440) % 1440 - 360) / 1440 * Math.PI * 2;
    this.sunDirection.set(Math.cos(angle) * .88, Math.sin(angle), -.48).normalize();
    const key = this.sunDirection.y > 0 ? this.sunDirection.clone() : this.sunDirection.clone().negate();
    key.y = Math.max(.32, key.y); key.normalize();
    this.sunlight.position.set(sx + key.x * 60, key.y * 60, sz + key.z * 60);
    this.sunlight.target.position.set(sx, 0, sz);
    const interior = this.zone !== "village" && this.zone !== "wilderness" && this.zone !== "highlands";
    const weather = weatherFor(store.state.day, store.state.minutes, this.zone ?? store.state.zone);
    const atmosphere = atmosphereFor(store.state.minutes, weather);
    this.ambienceDay = atmosphere.daylight;
    this.ambienceWet = weather.kind === "rain" || weather.kind === "storm" ? 1 : weather.kind === "fog" ? .4 : 0;
    // Less fill and a stronger key light give the sun shadows real depth without darkening night scenes.
    this.ambient.intensity = interior ? 1.15 : Math.max(.7, atmosphere.ambientIntensity * .62);
    this.sunlight.intensity = interior ? 1.55 : atmosphere.sunIntensity * 1.5;
    if (!interior) { this.ambient.intensity += this.lightning.flash; this.sunlight.intensity += this.lightning.flash; }
    this.ambient.color.copy(interior ? new THREE.Color(0xfff2d6) : atmosphere.ambient);
    this.ambient.groundColor.copy(interior ? new THREE.Color(0x5c7558) : atmosphere.ground);
    this.sunlight.color.copy(interior ? new THREE.Color(0xffebc0) : atmosphere.sun);
    const backdrop = interior ? new THREE.Color(0x15130f) : atmosphere.sky;
    (this.scene.background as THREE.Color).copy(backdrop);
    const fog = this.scene.fog as THREE.Fog;
    const first = this.firstPerson();
    fog.color.copy(backdrop);
    // Eye-level views see the whole valley: fog starts nearer but reaches the horizon ring.
    fog.near = interior ? (first ? 40 : 65) : first ? atmosphere.fogNear * .55 : atmosphere.fogNear;
    fog.far = interior ? (first ? 120 : 155) : first ? atmosphere.fogFar * 1.25 : atmosphere.fogFar;
    if (this.skyEnvironment) {
      this.scene.environment = this.skyEnvironment.update({ sunDirection: this.sunDirection, daylight: atmosphere.daylight, cloudiness: weather.cloudiness, outdoors: !interior });
      this.scene.environmentIntensity = interior ? .55 : .35 + atmosphere.daylight * .55;
      // Sky light now arrives through the environment, so the flat hemisphere fill steps back.
      this.ambient.intensity *= interior ? .6 : .55;
    }
    this.post?.setMood(interior ? .6 : atmosphere.daylight, interior);
  }
  private frame = (stamp: number) => {
    if (this.disposed) return;
    try { this.renderFrame(stamp); }
    catch {
      this.contextAvailable = false;
      this.effects.dispose();
      this.release();
      window.dispatchEvent(new CustomEvent("kg-renderer-failure", { detail: { message: "O visual 3D encontrou um problema. Sua campanha foi preservada. Use Tentar novamente para retomar." } }));
    }
  };
  private renderFrame(stamp: number): void {
    const elapsed = stamp - this.lastFrame;
    const dt = Math.max(0, Math.min(elapsed / 1000, .1)); this.lastFrame = stamp;
    if (this.post && !document.hidden && this.budget.sample(elapsed)) this.post.degrade();
    const scenic = store.state.phase === "title" || store.state.phase === "creation";
    const zone = scenic ? "village" : store.state.zone;
    if (this.zone !== zone || this.scenic !== scenic) this.rebuild(zone, scenic);
    const geometry = `${store.state.zone}:${store.state.property.building}:${estateBuildings(store.state).join(",")}`;
    if (geometry !== this.geometrySignature) { this.geometrySignature = geometry; this.clearRoute(); }
    const active = this.canAct();
    if (active) {
      if (this.pressed.has("Space")) this.attack();
      this.move(dt);
      store.tick(dt);
    } else this.release();
    this.effects.update(store.state, active ? dt : 0);
    if (active || (scenic && !document.hidden)) this.presentationTime += dt;
    this.syncActors(this.presentationTime);
    this.environment?.update(store.state, this.presentationTime);
    this.weather.update(weatherFor(store.state.day, store.state.minutes, zone), this.presentationTime,
      scenic ? { x: 1270, y: 880 } : store.state.apostle, store.state.minutes);
    this.lightning.update(store.state, zone, this.presentationTime);
    this.wildlife.update(store.state, zone, this.presentationTime);
    // Animals share the people's first-person scale so a dog stays dog-sized beside them.
    const animalScale = this.firstPerson() ? FIRST_PERSON_HUMAN_SCALE : 1;
    for (const animal of this.wildlife.group.children) {
      animal.userData.baseScale ??= animal.scale.x;
      animal.scale.setScalar(animal.userData.baseScale * animalScale);
    }
    this.updateCamera(Math.max(dt, .001));
    const shadowWeather = weatherFor(store.state.day, store.state.minutes, zone);
    const shadowLight = atmosphereFor(store.state.minutes, shadowWeather);
    for (const actor of this.actors.values()) actor.model.setLighting(shadowLight.daylight, !shadowWeather.outdoors);
    this.grounding.update([...this.actors.values()].map(actor => actor.model.group.position),
      { daylight: shadowLight.daylight, cloudiness: shadowWeather.cloudiness, indoors: !shadowWeather.outdoors });
    const mood = zone === "mine" || zone === "dungeon" ? "underground" : shadowWeather.outdoors ? "outdoor" : "interior";
    this.ambience.update(this.presentationTime, this.focus, this.ambienceDay, mood, this.ambienceWet, this.renderer.getPixelRatio());
    this.grass.update(zone, this.camera.position, this.firstPerson(), this.presentationTime, store.state.day);
    if (stamp - this.lastLabels > 45) { this.updateLabels(); this.lastLabels = stamp; }
    if (this.contextAvailable) this.draw();
    if (stamp - this.lastDebug > 200) {
      const canvas = this.renderer.domElement;
      canvas.dataset.cameraYaw = String(this.view.yaw);
      canvas.dataset.cameraDistance = String(this.view.distance);
      canvas.dataset.characterShadowDrawCalls = String(this.grounding.drawCalls);
      canvas.dataset.characterShadowCount = String(this.grounding.count);
      canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
      canvas.dataset.triangles = String(this.renderer.info.render.triangles);
      canvas.dataset.particleCount = String(this.effects.count);
      canvas.dataset.particleCapacity = String(this.effects.capacity);
      canvas.dataset.particleDrawCalls = String(this.effects.drawCalls);
      canvas.dataset.particleVersion = String(this.effects.version);
      canvas.dataset.particleKinds = JSON.stringify(this.effects.counts);
      canvas.dataset.weatherKind = weatherFor(store.state.day, store.state.minutes, zone).kind;
      canvas.dataset.weatherCount = String(this.weather.count);
      canvas.dataset.weatherCapacity = String(this.weather.capacity);
      canvas.dataset.weatherDrawCalls = String(this.weather.drawCalls);
      canvas.dataset.lightningWarning = JSON.stringify(store.state.worldLife.storm.warning);
      canvas.dataset.lightningImpact = JSON.stringify(store.state.worldLife.storm.impact);
      canvas.dataset.npcCount = String(store.state.npcs.length);
      canvas.dataset.visibleNpcCount = String(store.state.npcs.filter(npc => npc.zone === zone).length);
      canvas.dataset.npcs = JSON.stringify(store.state.npcs.filter(npc => npc.zone === zone).map(({ id, name, x, y, role }) => ({ id, name, x, y, role })));
      const animals = animalsForZone(store.state, zone);
      canvas.dataset.animalCount = String(animals.length);
      canvas.dataset.animals = JSON.stringify(animals.map(({ id, species, x, y, behavior, trust }) => ({ id, species, x, y, behavior, trust })));
      canvas.dataset.presentationTime = String(this.presentationTime);
      canvas.dataset.routeId = this.destination?.id ?? "";
      canvas.dataset.viewProjection = JSON.stringify(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).elements);
      canvas.dataset.frame = String(stamp);
      this.lastDebug = stamp;
    }
    this.frameId = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.release();
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.release);
    document.removeEventListener("visibilitychange", this.visibility);
    document.removeEventListener("kg-navigate", this.navigate);
    document.removeEventListener("kg-camera", this.changeCamera);
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.removeEventListener("wheel", this.wheel);
    this.renderer.domElement.removeEventListener("contextmenu", this.contextMenu);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.contextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.contextRestored);
    this.prompt.removeEventListener("click", this.promptClick);
    this.environment?.dispose();
    this.weather.dispose();
    this.lightning.dispose();
    this.ambience.dispose();
    this.grass.dispose();
    this.post?.dispose(); this.skyEnvironment?.dispose();
    this.renderer.domElement.removeEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.pointerUp);
    this.renderer.domElement.removeEventListener("pointercancel", this.pointerUp);
    document.removeEventListener("mousemove", this.mouseLook);
    document.removeEventListener("pointerlockchange", this.lockChange);
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.grounding.dispose();
    this.effects.dispose();
    this.wildlife.dispose();
    for (const actor of this.actors.values()) actor.model.dispose();
    this.actors.clear();
    for (const owned of [this.haloGeometry, this.haloMaterial, this.routeGeometry, this.routeMaterial]) owned.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.layer.remove();
    worldInput.attack = worldInput.interact = worldInput.dodge = () => {};
  }
}

export function mountWorld3D(element: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
  const world = new ThreeWorld(element, renderer);
  try { world.start(); } catch (error) { world.dispose(); throw error; }
  return () => world.dispose();
}

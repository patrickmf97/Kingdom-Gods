import Phaser from "phaser";
import { store } from "./simulation";
import { generateArt, createCharacterTexture } from "./art";
import { generateRegionArt } from "./region-art";
import { objectsForZone, regionForZone, resourceNode } from "./regions";
import { ESTATE_DEFS, estateBuildings } from "./territory-data";
import type { Dialog, EstateId, GameState, Npc, WorldObject, Zone } from "./types";
import { findPath, nearestWalkable, objectApproach, type Point, type NavigationContext } from "./navigation";
import { activeAutonomy, worldInput, blockedWorldInput as blockedInput } from "./world-input";
import { animalsForZone } from "./wildlife";
import { animalContainsPoint, createWildlifeSprite, generateWildlifeTextures, updateWildlifeSprite,
  type WildlifeSprite } from "./wildlife2d";

type Actor = {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  health?: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
};
type CullEntry = {
  object: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  margin: number;
  enabled?: boolean;
};
type EstateVisual = {
  sign: Phaser.GameObjects.Image;
  structure: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  structureCull: CullEntry;
  labelCull: CullEntry;
};
const buildingKeys: Record<string, string> = {
  orphanage: "house-orphanage",
  market: "market",
  forge: "forge",
  mill: "mill",
  bakery: "bakery",
  inn: "house-inn",
  house1: "house-house1",
  property: "farm",
  well: "well",
  dungeon: "crypt",
  tree1: "tree1",
  herb1: "herb",
  stone1: "rock",
  sign: "sign",
};

class KingdomScene extends Phaser.Scene {
  private activeZone: Zone | null = null;
  private scenic = true;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private actors = new Map<string, Actor>();
  private wildlifeSprites = new Map<string, WildlifeSprite>();
  private wildlifeTime = 0;
  private wildlifeMetadataTime = -1;
  private objectSprites = new Map<string, Phaser.GameObjects.Image>();
  private ground?: Phaser.GameObjects.Image;
  private foliage: Phaser.GameObjects.Image[] = [];
  private culled: CullEntry[] = [];
  private estateVisuals = new Map<EstateId, EstateVisual>();
  private estateSignature = "";
  private navigationGeometry = "";
  private season = "";
  private millSails?: Phaser.GameObjects.Image;
  private propertyHouse?: Phaser.GameObjects.Image;
  private propertyStatus?: Phaser.GameObjects.Text;
  private player?: Actor;
  private appearance = "";
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private destination: { x: number; y: number; interact?: string; path: Point[] } | null = null;
  private routeBlockedFor = 0;
  private animalFollowFor = 0;
  private navigate = (event: Event) => {
    if (store.state.phase !== "playing") return;
    const id = (event as CustomEvent<{ id?: string }>).detail?.id;
    if (!id || !objectsForZone(store.state.zone).some((object) => object.id === id)) return;
    // The map closes in the same React update; accept its event before the overlay disappears.
    worldInput.x = 0;
    worldInput.y = 0;
    this.planRoute(objectApproach(id, this.navigationContext()));
  };
  private releaseInput = () => {
    worldInput.x = 0;
    worldInput.y = 0;
    this.input.keyboard?.resetKeys();
  };
  private destinationRing?: Phaser.GameObjects.Graphics;
  private marker?: Phaser.GameObjects.Container;
  private markerText?: Phaser.GameObjects.Text;
  private markerLabel = "";
  private night?: Phaser.GameObjects.Rectangle;
  private motes: Phaser.GameObjects.Arc[] = [];
  private attackTime = 0;
  private workVisual?: Phaser.GameObjects.Container;
  private workText?: Phaser.GameObjects.Text;
  private workBar?: Phaser.GameObjects.Graphics;
  private workSwing?: Phaser.GameObjects.Graphics;
  private workSparks: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super("kingdom-world");
  }

  create() {
    // Base64 texture decoding can finish after this renderer was replaced.
    // Phaser calls create before its first pendingDestroy check in Game.step.
    if ((this.game as Phaser.Game & { pendingDestroy?: boolean }).pendingDestroy) return;
    generateArt(this);
    generateWildlifeTextures(this);
    this.keys = this.input.keyboard!.addKeys(
      {
        up: "W",
        down: "S",
        left: "A",
        right: "D",
        up2: "UP",
        down2: "DOWN",
        left2: "LEFT",
        right2: "RIGHT",
      },
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on("keydown-E", () => this.interact());
    this.input.keyboard!.on("keydown-SPACE", (event: KeyboardEvent) => {
      if (!blockedInput() && store.state.phase === "playing")
        event.preventDefault();
      this.attack();
    });
    this.input.keyboard!.on("keydown-SHIFT", () => this.dodge());
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
      this.click(pointer),
    );
    worldInput.attack = () => this.attack();
    worldInput.interact = () => this.interact();
    worldInput.dodge = () => this.dodge();
    document.addEventListener("kg-navigate", this.navigate);
    window.addEventListener("blur", this.releaseInput);
    this.rebuild();
    this.scale.on("resize", () => this.resize());
    let released = false;
    const releaseScene = () => {
      if (released) return;
      released = true;
      document.removeEventListener("kg-navigate", this.navigate);
      window.removeEventListener("blur", this.releaseInput);
      this.releaseInput();
      worldInput.attack = () => {};
      worldInput.interact = () => {};
      worldInput.dodge = () => {};
    };
    this.events.once("shutdown", releaseScene);
    this.events.once("destroy", releaseScene);
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private rebuild() {
    this.objects.forEach((object) => object.destroy());
    this.objects = [];
    this.actors.clear();
    this.wildlifeSprites.clear();
    this.wildlifeMetadataTime = -1;
    this.objectSprites.clear();
    this.ground = undefined;
    this.foliage = [];
    this.culled = [];
    this.estateVisuals.clear();
    this.estateSignature = "";
    this.navigationGeometry = "";
    this.season = "";
    this.millSails = undefined;
    this.propertyHouse = undefined;
    this.propertyStatus = undefined;
    this.player = undefined;
    this.appearance = "";
    this.motes = [];
    this.markerLabel = "";
    this.destination = null;
    this.scenic =
      store.state.phase === "title" || store.state.phase === "creation";
    this.activeZone = this.scenic ? "village" : store.state.zone;
    const village = this.activeZone === "village";
    const region = regionForZone(this.activeZone);
    const w = region.width;
    const h = region.height;
    generateRegionArt(this, this.activeZone);
    this.ground = this.keep(
      this.add
        .image(0, 0, village ? "village-ground" : `${this.activeZone}-ground`)
        .setOrigin(0)
        .setDepth(-1000),
    );
    this.cameras.main.setBounds(0, 0, w, h);
    this.physics.world.setBounds(0, 0, w, h);

    if (village || this.activeZone === "wilderness" || this.activeZone === "mine") {
      region.decor.forEach((item) => {
        const sprite = this.keep(
          this.add
            .image(item.x, item.y, item.key)
            .setOrigin(0.5, 1)
            .setDepth(item.y - 10 * (item.scale || 1)),
        );
        if (item.scale) sprite.setScale(item.scale);
        this.foliage.push(sprite);
        this.culled.push({ object: sprite, margin: 190 * (item.scale || 1) });
      });
      objectsForZone(this.activeZone).forEach((object) => this.addWorldObject(object));
      if (village && this.textures.exists("property-house")) {
        this.propertyHouse = this.keep(
          this.add
            .image(2090, 790, "property-house")
            .setOrigin(0.5, 1)
            .setDepth(778)
            .setVisible(store.state.property.building),
        );
        this.propertyStatus = this.keep(
          this.add
            .text(2090, 805, "", {
              fontFamily: "Arial, sans-serif",
              fontSize: "10px",
              color: "#f7d1a4",
              stroke: "#394438",
              strokeThickness: 3,
              backgroundColor: "#354436dd",
              padding: { x: 5, y: 3 },
            })
            .setOrigin(0.5)
            .setDepth(890)
            .setVisible(false),
        );
      }
    } else {
      const door = this.keep(
        this.add
          .text(
            450,
            818,
            this.activeZone === "orphanage" ? "VALEVERDE" : "SAÍDA DA CRIPTA",
            {
              fontFamily: "Georgia, serif",
              fontSize: "12px",
              color: "#d4bf8d",
              letterSpacing: 2,
            },
          )
          .setOrigin(0.5)
          .setDepth(100),
      );
      door.setAlpha(0.85);
    }

    this.destinationRing = this.keep(this.add.graphics().setDepth(1));
    this.workText = this.add.text(0, -91, "", {
      fontFamily: "Arial, sans-serif", fontSize: "11px", color: "#ffe4ad",
      stroke: "#24362d", strokeThickness: 3, align: "center",
    }).setOrigin(0.5);
    this.workBar = this.add.graphics();
    this.workSwing = this.add.graphics().setPosition(23, -33);
    this.workSwing.lineStyle(4, 0x8b6c42, 1).lineBetween(-9, 8, 8, -10);
    this.workSwing.lineStyle(3, 0xd9c38e, 1).lineBetween(-2, -14, 13, -8);
    this.workSparks = Array.from({ length: 3 }, (_, index) =>
      this.add.circle(28, -26, index ? 1 : 1.5, 0xebc581, 0));
    this.workVisual = this.keep(this.add.container(0, 0,
      [this.workText, this.workBar, this.workSwing, ...this.workSparks]).setDepth(9991).setVisible(false));
    const diamond = this.add.graphics();
    diamond.fillStyle(0xf6d58a, 1);
    diamond.fillPoints(
      [
        { x: 0, y: -8 },
        { x: 6, y: 0 },
        { x: 0, y: 8 },
        { x: -6, y: 0 },
      ],
      true,
    );
    diamond.lineStyle(1, 0xfff1c2, 0.8);
    diamond.strokePoints(
      [
        { x: 0, y: -8 },
        { x: 6, y: 0 },
        { x: 0, y: 8 },
        { x: -6, y: 0 },
      ],
      true,
      true,
    );
    this.markerText = this.add
      .text(0, 24, "", {
        fontFamily: "Arial, sans-serif",
        fontSize: "12px",
        color: "#fff0ca",
        backgroundColor: "#243c32dd",
        padding: { x: 9, y: 6 },
      })
      .setOrigin(0.5);
    this.marker = this.keep(
      this.add
        .container(0, 0, [diamond, this.markerText])
        .setDepth(9990)
        .setVisible(false),
    );

    for (let i = 0; i < (village ? 25 : 12); i++) {
      const mote = this.keep(
        this.add
          .circle(
            0,
            0,
            i % 4 === 0 ? 2 : 1,
            i % 3 === 0 ? 0xffdfa3 : 0xf2ead0,
            0.35,
          )
          .setDepth(8000),
      );
      mote.setData({
        seed: i * 137.9,
        startX: (i * 257) % w,
        startY: (i * 173) % h,
      });
      this.motes.push(mote);
    }
    this.night = this.keep(
      this.add
        .rectangle(
          0,
          0,
          this.scale.width + 20,
          this.scale.height + 20,
          0x132b44,
          0,
        )
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(9000),
    );
    this.updateSeason();
    this.resize();
    if (this.scenic) {
      this.cameras.main.stopFollow();
      this.cameras.main.centerOn(1200, 890);
    } else {
      this.makePlayer();
      this.cameras.main.startFollow(
        this.player!.sprite,
        true,
        0.13,
        0.13,
        0,
        35,
      );
      this.cameras.main.centerOn(
        store.state.apostle.x,
        store.state.apostle.y - 30,
      );
      this.cameras.main.fadeIn(400, 29, 48, 38);
    }
  }

  private addWorldObject(object: WorldObject) {
    if (object.kind === "estate") {
      this.addEstate(object);
      return;
    }
    const kindKeys: Record<string, string> = {
      cave: "frontier-cave", camp: "frontier-camp", ruins: "frontier-ruins",
      portal: this.activeZone === "mine" ? "frontier-exit" : "frontier-sign",
      resource: "tree1", herb: "herb", stone: "rock", ore: "frontier-ore",
    };
    const key = buildingKeys[object.id] || kindKeys[object.kind];
    if (key && this.textures.exists(key)) {
      const sprite = this.keep(this.add.image(object.x, object.y, key)
        .setOrigin(0.5, 1).setDepth(this.objectDepth(object)));
      this.objectSprites.set(object.id, sprite);
      this.culled.push({ object: sprite, margin: object.h || 180 });
      if (object.kind === "resource") this.foliage.push(sprite);
    } else if (object.kind !== "lake") return;
    if (object.id === "property") {
      // Soil and crops share a ground layer. Each solid boundary sorts at its own feet.
      for (const [key, depth] of [
        ["farm-shed", 750], ["farm-fence-back", 742], ["farm-fence-front", 874],
      ] as const) {
        const sprite = this.keep(this.add.image(object.x, object.y, key).setOrigin(0.5, 1).setDepth(depth));
        this.culled.push({ object: sprite, margin: 220 });
      }
      for (const x of [1790, 2010]) {
        for (let y = 750; y <= 870; y += 24) {
          const sprite = this.keep(this.add.image(x, y, "farm-fence-side").setOrigin(0.5, 1).setDepth(y));
          this.culled.push({ object: sprite, margin: 30 });
        }
      }
    }
    if (object.id === "tree1")
      this.foliage.push(this.objectSprites.get(object.id)!);
    if (object.id === "wild-gate") {
      const road = this.keep(this.add.graphics().setDepth(-990));
      road.lineStyle(68, 0xad9d79, 1).lineBetween(2140, 1510, 2170, 1710);
      road.lineStyle(54, 0xcbb994, 1).lineBetween(2140, 1510, 2170, 1710);
    }
    if (object.id === "mill") {
      this.millSails = this.keep(
        this.add
          .image(object.x - 1, object.y - 106, "mill-sails")
          .setDepth(this.objectDepth(object) + 1)
          .setRotation(Math.PI / 9),
      );
    }
    if (
      [
        "orphanage", "market", "forge", "mill", "bakery", "inn", "property", "dungeon",
      ].includes(object.id) || ["portal", "cave", "camp", "ruins", "lake"].includes(object.kind)
    ) {
      const labels: Record<string, string> = {
        orphanage: "ORFANATO",
        market: "MERCADO",
        forge: "FORJA",
        mill: "MOINHO",
        bakery: "PADARIA",
        inn: "ESTALAGEM",
        property: "PARCELA DO MOINHO",
        dungeon: "CRIPTA DAS RAÍZES",
      };
      const label = this.keep(
        this.add
          .text(object.x, object.y + 17, labels[object.id] || object.label.toUpperCase(), {
            fontFamily: "Arial, sans-serif",
            fontSize: "10px",
            color: "#f7edcc",
            letterSpacing: 1.7,
            stroke: "#354a36",
            strokeThickness: 3,
            wordWrap: { width: 250 }, align: "center",
          })
          .setOrigin(0.5)
          .setDepth(object.y + 1)
          .setAlpha(0.9),
      );
      this.culled.push({ object: label, margin: 140 });
    }
  }

  private addEstate(object: WorldObject) {
    const estate = ESTATE_DEFS.find((entry) => entry.id === object.id);
    if (!estate) return;
    const plot = this.keep(this.add.image(object.x, object.y, "estate-plot")
      .setOrigin(0.5, 1).setDepth(0));
    const structure = this.keep(this.add.image(object.x, object.y - 65, "estate-warehouse")
      .setOrigin(0.5, 1).setDepth(object.y - 65).setVisible(false));
    const sign = this.keep(this.add.image(object.x, object.y, "estate-sign-free")
      .setOrigin(0.5, 1).setDepth(object.y - 2));
    const label = this.keep(this.add.text(object.x, object.y + 20, "", {
      fontFamily: "Arial, sans-serif", fontSize: "10px", color: "#f7edcc",
      stroke: "#354a36", strokeThickness: 3, align: "center", lineSpacing: 4,
    }).setOrigin(0.5, 0).setDepth(8004));
    const structureCull: CullEntry = { object: structure, margin: 200, enabled: false };
    const labelCull: CullEntry = { object: label, margin: 160 };
    this.culled.push({ object: plot, margin: 220 }, structureCull,
      { object: sign, margin: 100 }, labelCull);
    this.objectSprites.set(object.id, sign);
    this.estateVisuals.set(estate.id, { sign, structure, label, structureCull, labelCull });
  }

  private updateEstates() {
    if (this.activeZone !== "wilderness") return;
    // The interaction marker already names a nearby plot. Hide its permanent
    // caption before the actor reaches it, so text never covers their body.
    for (const estate of ESTATE_DEFS) {
      const visual = this.estateVisuals.get(estate.id);
      if (visual) visual.labelCull.enabled = Math.hypot(
        store.state.apostle.x - estate.x, store.state.apostle.y - estate.y,
      ) > 140;
    }
    const signature = ESTATE_DEFS.map(({ id }) => {
      const holding = store.state.territory.parcels[id];
      return `${id}:${holding.owned}:${holding.building}:${Math.round(holding.condition)}`;
    }).join("|");
    if (signature === this.estateSignature) return;
    this.estateSignature = signature;
    for (const estate of ESTATE_DEFS) {
      const visual = this.estateVisuals.get(estate.id);
      if (!visual) continue;
      const holding = store.state.territory.parcels[estate.id];
      visual.sign.setTexture(holding.owned ? "estate-sign-owned" : "estate-sign-free");
      const built = holding.owned && holding.building !== "none";
      visual.structureCull.enabled = built;
      visual.structure.setVisible(built);
      if (built) visual.structure.setTexture(`estate-${holding.building}`)
        .setTint(holding.condition < 25 ? 0xaaa18c : 0xffffff);
      const status = !holding.owned ? "Terra livre · registro em Auren"
        : !built ? "Sua propriedade · Reino de Auren"
        : `${holding.building === "warehouse" ? "Armazém" : "Abrigo"} · ${Math.round(holding.condition)}%`;
      visual.label.setText(`${estate.name.toUpperCase()}\n${status}`);
    }
  }

  private objectDepth(object: WorldObject): number {
    // Transparent padding is not a wall: sort at the painted front edge.
    const frontOffsets: Record<string, number> = {
      orphanage: -10, inn: -10, house1: -10, market: -10,
      forge: -12, mill: -18, bakery: -12, tree1: -10,
    };
    const kindOffsets: Record<string, number> = {
      cave: -26, camp: -32, ruins: -42, resource: -10, stone: -6, ore: -6,
    };
    return object.id === "property" ? 0 : object.y + (frontOffsets[object.id] ?? kindOffsets[object.kind] ?? 0);
  }

  private makeActor(
    id: string,
    x: number,
    y: number,
    texture: string,
    label: string,
    player = false,
  ): Actor {
    const shadow = this.keep(
      this.add
        .ellipse(x, y - 1, player ? 30 : 25, 11, 0x172a20, 0.28)
        .setDepth(y - 2),
    );
    const sprite = this.keep(
      this.add
        .image(x, y, texture)
        .setOrigin(0.5, 1)
        .setScale(player ? 1.35 : 1.18)
        .setDepth(y),
    );
    const text = this.keep(
      this.add
        .text(x, y - (player ? 72 : 63), label, {
          fontFamily: "Arial, sans-serif",
          fontSize: player ? "12px" : "11px",
          color: player ? "#ffe7a8" : "#f9f0d8",
          stroke: "#253b30",
          strokeThickness: 3,
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setDepth(y + 5),
    );
    const health =
      texture === "enemy"
        ? this.keep(this.add.graphics().setDepth(y + 5))
        : undefined;
    const actor = { sprite, shadow, label: text, health, x, y };
    this.actors.set(id, actor);
    return actor;
  }

  private makePlayer() {
    const p = store.state.apostle;
    const signature = `${p.skin}-${p.hair}-${p.outfit}-${p.eyes}`;
    const key = `apostle-${signature.replace(/[^a-z0-9]/gi, "")}`;
    if (!this.textures.exists(key)) createCharacterTexture(this, key, p);
    if (!this.player)
      this.player = this.makeActor("player", p.x, p.y, key, p.name, true);
    else {
      this.player.sprite.setTexture(key);
      this.player.label.setText(p.name);
    }
    this.appearance = signature;
  }

  private npcVisible(npc: Npc) {
    if (this.activeZone === "orphanage") return npc.id === "matron";
    if (this.activeZone === "dungeon")
      return (
        npc.id ===
        (store.state as GameState & { simulation?: { companionId?: string } })
          .simulation?.companionId
      );
    return this.activeZone === "village" && npc.id !== "matron";
  }

  private syncActors(time: number) {
    const p = store.state.apostle;
    if (!this.scenic) {
      if (this.appearance !== `${p.skin}-${p.hair}-${p.outfit}-${p.eyes}`)
        this.makePlayer();
      this.positionActor(this.player!, p.x, p.y, time, true);
    }
    const present = new Set(["player"]);
    const visibleNpcs = store.state.npcs.filter((npc) => this.npcVisible(npc));
    const nearby = visibleNpcs.filter((npc) => Math.hypot(npc.x - p.x, npc.y - p.y) < 240)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const interactionTarget = this.scenic ? null : store.getNearest();
    const labelled: Npc[] = [];
    for (const npc of nearby) {
      if (labelled.length >= 3) break;
      if (labelled.every((other) => Math.abs(npc.x - other.x) > 115 || Math.abs(npc.y - other.y) > 80))
        labelled.push(npc);
    }
    visibleNpcs.forEach((npc, i) => {
        present.add(npc.id);
        let actor = this.actors.get(npc.id);
        if (!actor) {
          const key = `npc-${npc.id}`;
          if (!this.textures.exists(key))
            createCharacterTexture(
              this,
              key,
              {
                skin: i % 2 ? "#be8d68" : "#e3b58b",
                hair: ["#684230", "#414039", "#8a5431", "#55412e"][i % 4],
                outfit: npc.color,
              },
              npc.id,
            );
          actor = this.makeActor(
            npc.id,
            npc.x,
            npc.y,
            key,
            `${npc.name}\n${npc.role}`,
          );
          actor.label.setFontSize(10);
        }
        const role =
          store.state.economy.worker?.npcId === npc.id
            ? "Trabalhadora · parcela"
            : npc.role;
        const close = nearby[0]?.id === npc.id && Math.hypot(npc.x - p.x, npc.y - p.y) < 140;
        const label = close ? `${npc.name}\n${role}` : npc.name;
        if (actor.label.text !== label) actor.label.setText(label);
        this.positionActor(actor, npc.x, npc.y, time);
        actor.label.setVisible(!this.scenic && labelled.some((person) => person.id === npc.id) &&
          !(interactionTarget?.id === npc.id && interactionTarget.distance <= 120));
      });
    if (this.activeZone === "dungeon") {
      store.state.enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        present.add(enemy.id);
        let actor = this.actors.get(enemy.id);
        if (!actor)
          actor = this.makeActor(
            enemy.id,
            enemy.x,
            enemy.y,
            "enemy",
            "Esqueleto da cripta",
          );
        this.positionActor(actor, enemy.x, enemy.y, time);
        actor.label.setAlpha(
          Math.hypot(p.x - enemy.x, p.y - enemy.y) < 190 ? 1 : 0,
        );
        const percent = enemy.hp / enemy.maxHp;
        actor.sprite.setTint(percent < 0.4 ? 0xffb1a1 : 0xffffff);
        actor.health
          ?.clear()
          .fillStyle(0x1e302b, 0.9)
          .fillRect(enemy.x - 21, enemy.y - 55, 42, 4)
          .fillStyle(0xca826a, 1)
          .fillRect(enemy.x - 20, enemy.y - 54, 40 * percent, 2)
          .setDepth(enemy.y + 5)
          .setVisible(Math.hypot(p.x - enemy.x, p.y - enemy.y) < 190);
      });
    }
    this.actors.forEach((actor, id) => {
      if (!present.has(id)) {
        actor.sprite.destroy();
        actor.shadow.destroy();
        actor.label.destroy();
        actor.health?.destroy();
        this.actors.delete(id);
      }
    });
  }

  private positionActor(
    actor: Actor,
    x: number,
    y: number,
    time: number,
    player = false,
  ) {
    const moved = Math.hypot(x - actor.x, y - actor.y) > 0.05;
    const bob = moved ? Math.sin(time / 90) * 1.8 : Math.sin(time / 480) * 0.35;
    if (x < actor.x - 0.05) actor.sprite.setFlipX(true);
    else if (x > actor.x + 0.05) actor.sprite.setFlipX(false);
    actor.sprite.setPosition(x, y + bob).setDepth(y);
    actor.shadow
      .setPosition(x, y - 1)
      .setDepth(y - 2)
      .setScale(moved ? 0.9 : 1, 1);
    actor.label
      .setPosition(
        x,
        y - (player ? 75 : actor.label.text.includes("\n") ? 76 : 63) + bob,
      )
      .setDepth(8005);
    actor.x = x;
    actor.y = y;
  }

  private resize() {
    const width = this.scale.width,
      height = this.scale.height;
    const zoom = this.scenic
      ? Math.max(0.82, Math.min(1.17, height / 750))
      : width < 700
        ? 1.2
        : Math.max(0.96, Math.min(1.32, height / 700));
    this.cameras.main.setZoom(zoom);
    this.night?.setSize(width + 20, height + 20);
  }

  private canAct() {
    return store.state.phase === "playing" && !blockedInput();
  }

  private interact(id?: string) {
    if (!this.canAct()) return;
    this.clearRoute();
    const nearest = store.getNearest();
    if (!id && (!nearest || nearest.distance > 120)) {
      store.notify("Aproxime-se de alguém ou de um lugar para interagir.");
      return;
    }
    const dialog: Dialog | null = store.interact(id || nearest!.id);
    if (dialog)
      document.dispatchEvent(
        new CustomEvent("kg-interact", { detail: dialog }),
      );
  }

  private attack() {
    if (!this.canAct()) return;
    this.clearRoute();
    if (this.time.now - this.attackTime < 280) return;
    this.attackTime = this.time.now;
    const p = store.state.apostle;
    const facing = this.player?.sprite.flipX ? -1 : 1;
    store.attack();
    const effect = this.add
      .graphics()
      .setPosition(p.x, p.y - 26)
      .setDepth(p.y + 4);
    effect.lineStyle(5, 0xffe6a0, 0.85);
    effect.beginPath();
    effect.arc(0, 0, 43, facing < 0 ? 2 : -1.1, facing < 0 ? 4.25 : 1.1, false);
    effect.strokePath();
    effect.lineStyle(2, 0xffffff, 0.9);
    effect.beginPath();
    effect.arc(0, 0, 47, facing < 0 ? 2 : -1.1, facing < 0 ? 4.25 : 1.1, false);
    effect.strokePath();
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 1.3,
      duration: 220,
      onComplete: () => effect.destroy(),
    });
    this.clearRoute();
  }

  private dodge() {
    if (!this.canAct()) return;
    this.clearRoute();
    const p = store.state.apostle;
    const stamina = p.stamina;
    store.dodge();
    if (p.stamina >= stamina) return;
    let x =
      (this.keys.right.isDown || this.keys.right2.isDown ? 1 : 0) -
      (this.keys.left.isDown || this.keys.left2.isDown ? 1 : 0) +
      worldInput.x;
    const y =
      (this.keys.down.isDown || this.keys.down2.isDown ? 1 : 0) -
      (this.keys.up.isDown || this.keys.up2.isDown ? 1 : 0) +
      worldInput.y;
    if (!x && !y) x = this.player?.sprite.flipX ? -1 : 1;
    store.move(x, y, 0.36);
    if (this.player)
      this.tweens.add({
        targets: this.player.sprite,
        alpha: 0.4,
        duration: 100,
        yoyo: true,
      });
    this.clearRoute();
  }

  private navigationContext(): NavigationContext {
    return { zone: store.state.zone, building: store.state.property.building,
      estates: estateBuildings(store.state) };
  }

  private clearRoute() {
    this.destination = null;
    this.routeBlockedFor = 0;
    this.animalFollowFor = 0;
    this.destinationRing?.clear();
  }

  private planRoute(point: Point, interact?: string) {
    const goal = nearestWalkable(point, this.navigationContext());
    if (Math.hypot(goal.x - store.state.apostle.x, goal.y - store.state.apostle.y) < 1) {
      this.clearRoute();
      if (interact) this.interact(interact);
      return;
    }
    const path = findPath(store.state.apostle, goal, this.navigationContext());
    if (!path.length) {
      this.clearRoute();
      store.notify("Não há um caminho livre até esse lugar. Escolha outro acesso.");
      return;
    }
    const endpoint = path[path.length - 1];
    this.destination = { ...endpoint, path, interact };
    this.routeBlockedFor = 0;
    this.drawRoute();
  }

  private drawRoute() {
    const graphics = this.destinationRing?.clear();
    if (!graphics || !this.destination) return;
    const points = [store.state.apostle, ...this.destination.path];
    graphics.lineStyle(1.5, 0xf6dfa1, 0.5);
    // Small dots keep the route readable without painting over the village.
    graphics.fillStyle(0xf6dfa1, 0.6);
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1], end = points[i];
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      for (let at = 15; at < distance; at += 28) {
        graphics.fillCircle(start.x + (end.x - start.x) * at / distance,
          start.y + (end.y - start.y) * at / distance, 1.7);
      }
    }
    graphics.strokeEllipse(this.destination.x, this.destination.y, 20, 10).setDepth(2);
  }

  private click(pointer: Phaser.Input.Pointer) {
    if (!this.canAct()) return;
    if (pointer.rightButtonDown()) {
      this.attack();
      return;
    }
    if (pointer.wasTouch && (Math.hypot(worldInput.x, worldInput.y) > 0.05 ||
      document.body.dataset.joystick === "true")) return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const p = store.state.apostle;
    const objects = objectsForZone(store.state.zone);
    let target: (Point & { id: string }) | undefined;
    const object = objects.find((obj) =>
      Math.abs(point.x - obj.x) < (obj.w || 90) / 2 &&
      point.y > obj.y - (obj.h || 88) && point.y < obj.y + 30);
    if (object) target = { ...objectApproach(object.id, this.navigationContext()), id: object.id };
    if (this.activeZone === "village") {
      if (store.state.property.building && point.x >= 2010 && point.x <= 2170 &&
        point.y >= 650 && point.y <= 815)
        target = { x: 2090, y: 815, id: "property" };
    }
    const npc = store.state.npcs.find((person) => this.npcVisible(person) &&
      Math.hypot(point.x - person.x, point.y - person.y + 25) < 38);
    if (npc) target = { x: npc.x, y: npc.y + 40, id: npc.id };
    const animal = animalsForZone(store.state, store.state.zone)
      .filter((animal) => animalContainsPoint(animal, point))
      .sort((a, b) => b.y - a.y)[0];
    if (animal && (!npc || animal.y > npc.y))
      target = { x: animal.x, y: animal.y + 16, id: `animal:${animal.id}` };
    const source = target && (store.state.npcs.find((person) => person.id === target!.id) ||
      (target.id.startsWith("animal:") ? animal : undefined) ||
      (target.id === "property" && target.x === 2090 ? target :
        objects.find((object) => object.id === target!.id)) || target);
    if (target && source && Math.hypot(p.x - source.x, p.y - source.y) < (target.id.startsWith("animal:") ? 130 : 120)) {
      this.interact(target.id);
      return;
    }
    this.animalFollowFor = 0;
    this.planRoute(target || point, target?.id);
  }

  private move(dt: number) {
    const p = store.state.apostle;
    // A contextual autonomous decision replaces the player's pending travel order.
    if (this.destination && activeAutonomy(store.state))
      this.clearRoute();
    if (this.destination && store.state.frontier.work) this.clearRoute();
    let x = (this.keys.right.isDown || this.keys.right2.isDown ? 1 : 0) -
      (this.keys.left.isDown || this.keys.left2.isDown ? 1 : 0) + worldInput.x;
    let y = (this.keys.down.isDown || this.keys.down2.isDown ? 1 : 0) -
      (this.keys.up.isDown || this.keys.up2.isDown ? 1 : 0) + worldInput.y;
    const manual = Math.hypot(x, y) > 0.05;
    if (manual) this.clearRoute();
    let movementDt = dt;
    if (!manual && this.destination) {
      const animalId = this.destination.interact?.startsWith("animal:")
        ? this.destination.interact.slice(7) : null;
      if (animalId) {
        const animal = store.state.wildlife.animals[animalId];
        if (!animal || animal.zone !== this.activeZone) {
          this.clearRoute();
          return;
        }
        if (Math.hypot(animal.x - p.x, animal.y - p.y) <= 130) {
          this.interact(`animal:${animalId}`);
          return;
        }
        this.animalFollowFor += dt;
        if (this.animalFollowFor > 12) {
          this.clearRoute();
          store.notify("O animal se afastou. Aproxime-se e tente novamente.");
          return;
        }
        if (Math.hypot(animal.x - this.destination.x, animal.y + 16 - this.destination.y) > 60) {
          const followFor = this.animalFollowFor;
          this.planRoute({ x: animal.x, y: animal.y + 16 }, `animal:${animalId}`);
          this.animalFollowFor = followFor;
        }
      }
      // An NPC can keep walking after being clicked; refresh its reachable approach.
      const npc = store.state.npcs.find((person) => person.id === this.destination?.interact);
      if (npc && Math.hypot(npc.x - this.destination.x, npc.y + 40 - this.destination.y) > 70)
        this.planRoute({ x: npc.x, y: npc.y + 40 }, npc.id);
      while (this.destination?.path.length &&
        Math.hypot(this.destination.path[0].x - p.x, this.destination.path[0].y - p.y) < 1)
        this.destination.path.shift();
      if (this.destination && !this.destination.path.length) {
        const id = this.destination.interact;
        this.clearRoute();
        if (id) this.interact(id);
      }
      const waypoint = this.destination?.path[0];
      if (waypoint) {
        x = waypoint.x - p.x;
        y = waypoint.y - p.y;
        // Clamp travel time, so a low frame rate cannot overshoot a corner.
        movementDt = Math.min(dt, Math.hypot(x, y) / 170);
      }
    }
    const length = Math.hypot(x, y);
    if (length > 0.05) {
      const before = { x: p.x, y: p.y };
      store.move(x / length, y / length, movementDt);
      if (this.destination) {
        this.routeBlockedFor = Math.hypot(p.x - before.x, p.y - before.y) < 0.02
          ? this.routeBlockedFor + dt : 0;
        if (this.routeBlockedFor > 1.2 && !activeAutonomy(store.state))
          this.planRoute(this.destination, this.destination.interact);
      }
    }
    if (this.destination) this.drawRoute();
  }

  update(time: number, delta: number) {
    if (!this.activeZone) return;
    const shouldScenic =
      store.state.phase === "title" || store.state.phase === "creation";
    if (
      shouldScenic !== this.scenic ||
      (!shouldScenic && store.state.zone !== this.activeZone)
    )
      this.rebuild();
    const geometry = `${store.state.zone}:${store.state.property.building}:${estateBuildings(store.state).join(",")}`;
    if (geometry !== this.navigationGeometry) {
      this.clearRoute();
      this.navigationGeometry = geometry;
    }
    const dt = Math.min(delta / 1000, 0.1);
    const running = this.canAct() && !document.hidden;
    if (running) {
      this.move(dt);
      store.tick(dt);
    }
    if (running || (this.scenic && !document.hidden)) this.wildlifeTime += dt;
    this.syncWildlife();
    this.syncActors(time);
    if (this.activeZone === "village") {
      const farm = this.objectSprites.get("property");
      const planted = store.state.property.plantedAt !== null;
      const ready =
        planted &&
        store.state.day >=
          (store.state.economy.crop?.readyDay ?? store.state.property.plantedAt! + 2);
      const farmKey = planted ? (ready ? "farm" : "farm-growing") : "farm-empty";
      if (farm && farm.texture.key !== farmKey) farm.setTexture(farmKey);
      this.propertyHouse?.setVisible(store.state.property.building);
      const condition = store.state.economy.condition;
      const worn = store.state.property.building && condition < 25;
      this.propertyHouse?.setTint(worn ? 0xaaa18c : 0xffffff);
      if (this.propertyStatus) {
        const status = `Precisa de reparos · ${Math.round(condition)}%`;
        if (this.propertyStatus.text !== status)
          this.propertyStatus.setText(status);
        this.propertyStatus.setVisible(worn);
      }
      if (this.millSails && !blockedInput()) this.millSails.rotation += dt * 0.16;
    }
    this.updateSeason();
    this.updateEstates();
    this.updateResources();
    this.updateWork(time);
    this.cullScenery();
    if (this.scenic) {
      this.cameras.main.centerOn(
        1190 + Math.sin(time / 50000) * 75,
        855 + Math.sin(time / 39000) * 25,
      );
    }
    this.updateMarker(time);
    const hour = store.state.minutes / 60;
    const outdoors = this.activeZone === "village" || this.activeZone === "wilderness";
    const dark = this.scenic
      ? 0
      : this.activeZone === "mine" ? 0.12
      : hour < 6 || hour > 19
        ? 0.32
        : hour > 17
          ? (hour - 17) * 0.1
          : 0;
    this.night?.setAlpha(dark);
    this.motes.forEach((mote, index) => {
      const seed = mote.getData("seed") as number;
      const region = regionForZone(this.activeZone!);
      const w = region.width;
      const winter = outdoors && this.season === "Inverno";
      const autumn = outdoors && this.season === "Outono";
      mote.setPosition(
        (mote.getData("startX") +
          time / (winter ? 450 : 190) +
          Math.sin(time / 3700 + seed) * 17) %
          w,
        winter || autumn
          ? (mote.getData("startY") + time / (winter ? 65 : 100)) % region.height
          : mote.getData("startY") + Math.sin(time / 2200 + seed) * 30,
      );
      mote.setAlpha(
        (0.16 + Math.sin(time / 1600 + index) * 0.11) * (winter || dark ? 1.8 : 1),
      );
    });
  }

  private updateSeason() {
    if (this.activeZone !== "village" && this.activeZone !== "wilderness") return;
    const season = store.getCalendar().season;
    if (season === this.season) return;
    this.season = season;
    const palette: Record<
      string,
      { ground: number; leaves: number; mote: number }
    > = {
      Primavera: { ground: 0xffffff, leaves: 0xffffff, mote: 0xf4ded9 },
      Verão: { ground: 0xfff3d4, leaves: 0xe8f1c8, mote: 0xffdda0 },
      Outono: { ground: 0xf4d4a8, leaves: 0xffb57a, mote: 0xd8a064 },
      Inverno: { ground: 0xd5e2ee, leaves: 0xabc4d0, mote: 0xf0f6ff },
    };
    const colors = palette[season] || palette.Primavera;
    this.ground?.setTint(colors.ground);
    this.foliage.forEach((sprite) => sprite.setTint(colors.leaves));
    this.motes.forEach((mote, index) => {
      const tint = season === "Inverno" && index % 3 !== 0 ? 0xffffff : colors.mote;
      mote.setFillStyle(tint, 0.65);
    });
  }

  private syncWildlife() {
    const animals = animalsForZone(store.state, this.activeZone!);
    const present = new Set(animals.map((animal) => animal.id));
    const view = this.cameras.main.worldView;
    for (const animal of animals) {
      let visual = this.wildlifeSprites.get(animal.id);
      if (!visual) {
        visual = createWildlifeSprite(this, animal);
        this.keep(visual.sprite);
        this.keep(visual.shadow);
        this.wildlifeSprites.set(animal.id, visual);
      }
      updateWildlifeSprite(visual, animal, this.wildlifeTime);
      const visible = animal.x >= view.left - 80 && animal.x <= view.right + 80 &&
        animal.y >= view.top - 80 && animal.y <= view.bottom + 80;
      visual.sprite.setVisible(visible);
      visual.shadow.setVisible(visible);
    }
    for (const [id, visual] of this.wildlifeSprites) {
      if (present.has(id)) continue;
      visual.sprite.destroy(); visual.shadow.destroy();
      this.wildlifeSprites.delete(id);
    }
    if (this.wildlifeTime - this.wildlifeMetadataTime >= .2 || this.wildlifeMetadataTime < 0) {
      this.wildlifeMetadataTime = this.wildlifeTime;
      this.game.canvas.dataset.animalCount = String(animals.length);
      this.game.canvas.dataset.animals = JSON.stringify(animals.map(({ id, species, x, y, behavior, trust }) =>
        ({ id, species, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, behavior, trust })));
    }
  }

  private updateResources() {
    if (!this.activeZone) return;
    for (const object of objectsForZone(this.activeZone)) {
      if (!resourceNode(object.id)) continue;
      const sprite = this.objectSprites.get(object.id);
      if (!sprite) continue;
      const exhausted = store.state.frontier.resources[object.id]?.remaining === 0;
      sprite.setAlpha(exhausted ? 0.48 : 1);
      if (object.kind === "ore") {
        const key = exhausted ? "frontier-ore-empty" : "frontier-ore";
        if (sprite.texture.key !== key) sprite.setTexture(key);
      }
    }
  }

  private updateWork(time: number) {
    const work = store.state.frontier.work;
    if (!this.workVisual || !this.workBar || !this.workText || !this.workSwing) return;
    this.workVisual.setVisible(!!work && !this.scenic && work.zone === this.activeZone);
    if (!work) return;
    const p = store.state.apostle, node = resourceNode(work.nodeId);
    const progress = Phaser.Math.Clamp(work.elapsed / work.duration, 0, 1);
    const verbs: Record<string, string> = {
      wood: "Recolhendo madeira", herb: "Colhendo ervas",
      stone: "Extraindo pedra", ore: "Extraindo ferro",
    };
    const label = `${verbs[node?.resource || ""] || "Trabalhando"} · ${Math.round(progress * 100)}%`;
    if (this.workText.text !== label) this.workText.setText(label);
    this.workVisual.setPosition(p.x, p.y);
    this.workBar.clear().fillStyle(0x263a30, 0.9).fillRoundedRect(-42, -79, 84, 7, 2)
      .fillStyle(0xe4c580, 1).fillRect(-40, -77, progress * 80, 3);
    const swinging = node?.tool !== null;
    this.workSwing.setVisible(swinging).setRotation(Math.sin(time / 130) * 0.65 - 0.3);
    const beat = (time % 580) / 580;
    this.workSparks.forEach((spark, i) => {
      const drift = (beat + i / 4) % 1;
      spark.setPosition(24 + drift * (12 + i * 5), -22 - Math.sin(drift * Math.PI) * (10 + i * 4))
        .setAlpha(swinging && drift < 0.6 ? (0.6 - drift) * 1.2 : 0);
    });
    // A very small body motion connects the timed action with the physical actor.
    if (this.player) this.player.sprite.setPosition(p.x + Math.sin(time / 130) * 0.6, p.y);
  }

  private cullScenery() {
    const view = this.cameras.main.worldView;
    for (const { object, margin, enabled } of this.culled) {
      object.setVisible(enabled !== false && object.x >= view.left - margin && object.x <= view.right + margin &&
        object.y >= view.top - margin && object.y <= view.bottom + margin);
    }
  }

  private updateMarker(time: number) {
    if (!this.marker || !this.markerText || this.scenic || blockedInput()) {
      this.marker?.setVisible(false);
      return;
    }
    const nearest = store.getNearest();
    if (!nearest || nearest.distance > 120) {
      this.marker.setVisible(false);
      return;
    }
    const npc = store.state.npcs.find((person) => person.id === nearest.id);
    const animal = nearest.id.startsWith("animal:");
    const resource = resourceNode(nearest.id);
    const estate = ESTATE_DEFS.some((entry) => entry.id === nearest.id);
    const role = npc && store.state.economy.worker?.npcId === npc.id
      ? "Trabalhadora" : npc?.role;
    const label = `${nearest.label}${role ? ` · ${role}` : ""}  ·  E`;
    if (label !== this.markerLabel) {
      this.markerText.setText(label);
      this.markerLabel = label;
    }
    this.marker
      .setPosition(
        nearest.x,
        nearest.y + (npc ? -112 : animal ? -72 : estate ? 58 : resource ? 24 : -40) + Math.sin(time / 380) * 3,
      )
      .setVisible(true);
  }
}

export function mountWorld(element: HTMLElement): () => void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: element,
    width: element.clientWidth || window.innerWidth,
    height: element.clientHeight || window.innerHeight,
    backgroundColor: "#577449",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    audio: { noAudio: true },
    physics: { default: "arcade", arcade: { debug: false } },
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
    scene: KingdomScene,
  });
  const observer = new ResizeObserver((entries) => {
    const bounds = entries[0]?.contentRect;
    if (bounds?.width && bounds?.height)
      game.scale.resize(bounds.width, bounds.height);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    // Phaser destroys the Game on its next frame. Stop the scene now so its
    // input shutdown cannot overwrite the next renderer's shared controls.
    game.scene.stop("kingdom-world");
    game.canvas?.remove();
    game.destroy(true);
    worldInput.x = 0;
    worldInput.y = 0;
  };
}

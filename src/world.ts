import Phaser from "phaser";
import { store } from "./simulation";
import { OBJECTS, WORLD_W, WORLD_H } from "./data";
import { generateArt, createCharacterTexture, villageDecor } from "./art";
import type { Dialog, GameState, Npc, WorldObject, Zone } from "./types";

export const worldInput = {
  x: 0,
  y: 0,
  attack: () => {},
  interact: () => {},
  dodge: () => {},
};

type Actor = {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  health?: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
};
const buildingKeys: Record<string, string> = {
  orphanage: "house-orphanage",
  market: "market",
  forge: "forge",
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

function blockedInput() {
  const active = document.activeElement;
  return (
    document.body.dataset.overlay === "true" ||
    !!active?.matches('input,textarea,select,[contenteditable="true"]')
  );
}

class KingdomScene extends Phaser.Scene {
  private activeZone: Zone | null = null;
  private scenic = true;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private actors = new Map<string, Actor>();
  private objectSprites = new Map<string, Phaser.GameObjects.Image>();
  private propertyHouse?: Phaser.GameObjects.Image;
  private player?: Actor;
  private appearance = "";
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private destination: { x: number; y: number; interact?: string } | null =
    null;
  private destinationRing?: Phaser.GameObjects.Graphics;
  private marker?: Phaser.GameObjects.Container;
  private markerText?: Phaser.GameObjects.Text;
  private markerLabel = "";
  private night?: Phaser.GameObjects.Rectangle;
  private motes: Phaser.GameObjects.Arc[] = [];
  private attackTime = 0;

  constructor() {
    super("kingdom-world");
  }

  create() {
    generateArt(this);
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
    this.rebuild();
    this.scale.on("resize", () => this.resize());
    this.events.once("shutdown", () => {
      worldInput.attack = () => {};
      worldInput.interact = () => {};
      worldInput.dodge = () => {};
    });
  }

  private keep<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private rebuild() {
    this.objects.forEach((object) => object.destroy());
    this.objects = [];
    this.actors.clear();
    this.objectSprites.clear();
    this.propertyHouse = undefined;
    this.player = undefined;
    this.appearance = "";
    this.motes = [];
    this.markerLabel = "";
    this.destination = null;
    this.scenic =
      store.state.phase === "title" || store.state.phase === "creation";
    this.activeZone = this.scenic ? "village" : store.state.zone;
    const village = this.activeZone === "village";
    const w = village ? WORLD_W : 900;
    const h = village ? WORLD_H : 900;
    this.keep(
      this.add
        .image(0, 0, village ? "village-ground" : `${this.activeZone}-ground`)
        .setOrigin(0)
        .setDepth(-1000),
    );
    this.cameras.main.setBounds(0, 0, w, h);
    this.physics.world.setBounds(0, 0, w, h);

    if (village) {
      villageDecor.forEach((item) => {
        const sprite = this.keep(
          this.add
            .image(item.x, item.y, item.key)
            .setOrigin(0.5, 1)
            .setDepth(item.y),
        );
        if (item.scale) sprite.setScale(item.scale);
      });
      OBJECTS.forEach((object) => this.addWorldObject(object));
      if (this.textures.exists("property-house"))
        this.propertyHouse = this.keep(
          this.add
            .image(1990, 792, "property-house")
            .setOrigin(0.5, 1)
            .setDepth(792)
            .setVisible(store.state.property.building),
        );
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
    const key = buildingKeys[object.id];
    if (!key || !this.textures.exists(key)) return;
    this.objectSprites.set(
      object.id,
      this.keep(
        this.add
          .image(object.x, object.y, key)
          .setOrigin(0.5, 1)
          .setDepth(object.y),
      ),
    );
    if (
      ["orphanage", "market", "forge", "inn", "property", "dungeon"].includes(
        object.id,
      )
    ) {
      const labels: Record<string, string> = {
        orphanage: "ORFANATO",
        market: "MERCADO",
        forge: "FORJA",
        inn: "ESTALAGEM",
        property: "PARCELA DO MOINHO",
        dungeon: "CRIPTA DAS RAÍZES",
      };
      this.keep(
        this.add
          .text(object.x, object.y + 17, labels[object.id], {
            fontFamily: "Arial, sans-serif",
            fontSize: "10px",
            color: "#f7edcc",
            letterSpacing: 1.7,
            stroke: "#354a36",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(object.y + 1)
          .setAlpha(0.9),
      );
    }
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
    store.state.npcs
      .filter((npc) => this.npcVisible(npc))
      .forEach((npc, i) => {
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
        this.positionActor(actor, npc.x, npc.y, time);
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
      .setDepth(y + 5);
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
    const nearest = store.getNearest();
    if (!id && (!nearest || nearest.distance > 120)) {
      store.notify("Aproxime-se de alguém ou de um lugar para interagir.");
      return;
    }
    const dialog: Dialog | null = store.interact(id || nearest!.id);
    this.destination = null;
    if (dialog)
      document.dispatchEvent(
        new CustomEvent("kg-interact", { detail: dialog }),
      );
  }

  private attack() {
    if (!this.canAct() || this.time.now - this.attackTime < 280) return;
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
    this.destination = null;
  }

  private dodge() {
    if (!this.canAct()) return;
    const p = store.state.apostle;
    const before = { x: p.x, y: p.y };
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
    if (!this.allowed(p.x, p.y)) {
      p.x = before.x;
      p.y = before.y;
    }
    if (this.player)
      this.tweens.add({
        targets: this.player.sprite,
        alpha: 0.4,
        duration: 100,
        yoyo: true,
      });
    this.destination = null;
  }

  private click(pointer: Phaser.Input.Pointer) {
    if (!this.canAct()) return;
    if (pointer.rightButtonDown()) {
      this.attack();
      return;
    }
    if (pointer.wasTouch && document.body.dataset.joystick === "true") return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const p = store.state.apostle;
    let target: { x: number; y: number; id: string } | undefined;
    if (this.activeZone === "village") {
      const object = OBJECTS.find(
        (obj) =>
          Math.abs(point.x - obj.x) < (obj.w || 65) / 2 &&
          point.y > obj.y - (obj.h || 75) &&
          point.y < obj.y + 30,
      );
      if (object) target = { x: object.x, y: object.y + 46, id: object.id };
    } else if (Math.hypot(point.x - 450, point.y - 790) < 75)
      target = { x: 450, y: 755, id: "exit" };
    const npc = store.state.npcs.find(
      (person) =>
        this.npcVisible(person) &&
        Math.hypot(point.x - person.x, point.y - person.y + 25) < 38,
    );
    if (npc) target = { x: npc.x, y: npc.y + 50, id: npc.id };
    if (target && Math.hypot(p.x - target.x, p.y - target.y) < 120) {
      this.interact(target.id);
      return;
    }
    this.destination = target
      ? { x: target.x, y: target.y, interact: target.id }
      : { x: point.x, y: point.y };
    this.destinationRing
      ?.clear()
      .lineStyle(1.5, 0xf6dfa1, 0.6)
      .strokeEllipse(this.destination.x, this.destination.y, 20, 10);
    this.destinationRing?.setDepth(this.destination.y - 2);
  }

  private allowed(x: number, y: number) {
    if (this.activeZone !== "village")
      return x >= 72 && x <= 828 && y >= 135 && y <= 800;
    if (x < 70 || y < 90 || x > WORLD_W - 70 || y > WORLD_H - 70) return false;
    const onBridge = x > 318 && x < 462 && y > 856 && y < 930;
    if (!onBridge) {
      const river = [
        [-120, 436],
        [102, 524],
        [244, 702],
        [388, 908],
        [320, 1130],
        [274, 1304],
        [406, 1554],
        [300, 1774],
        [136, 1980],
      ];
      for (let i = 0; i < river.length - 1; i++) {
        const [ax, ay] = river[i],
          [bx, by] = river[i + 1];
        const dx = bx - ax,
          dy = by - ay;
        const t = Math.max(
          0,
          Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
        );
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) < 47) return false;
      }
    }
    // Doors lie just below a building's footprint, leaving all interaction anchors reachable.
    for (const object of OBJECTS) {
      if (!["house", "forge", "market"].includes(object.kind)) continue;
      const half = (object.w || 150) / 2 - 8;
      const top = object.y - (object.h || 120) + 34;
      if (
        x > object.x - half &&
        x < object.x + half &&
        y > top &&
        y < object.y - 10
      )
        return false;
    }
    return true;
  }

  private move(dt: number) {
    const p = store.state.apostle;
    let x =
      (this.keys.right.isDown || this.keys.right2.isDown ? 1 : 0) -
      (this.keys.left.isDown || this.keys.left2.isDown ? 1 : 0) +
      worldInput.x;
    let y =
      (this.keys.down.isDown || this.keys.down2.isDown ? 1 : 0) -
      (this.keys.up.isDown || this.keys.up2.isDown ? 1 : 0) +
      worldInput.y;
    if (x || y) this.destination = null;
    else if (this.destination) {
      x = this.destination.x - p.x;
      y = this.destination.y - p.y;
      if (Math.hypot(x, y) < 9) {
        const id = this.destination.interact;
        this.destination = null;
        if (id) this.interact(id);
        x = 0;
        y = 0;
      }
    }
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
      const before = { x: p.x, y: p.y };
      store.move(x, y, dt);
      const after = { x: p.x, y: p.y };
      if (!this.allowed(after.x, after.y)) {
        if (this.allowed(after.x, before.y)) p.y = before.y;
        else if (this.allowed(before.x, after.y)) p.x = before.x;
        else {
          p.x = before.x;
          p.y = before.y;
          this.destination = null;
        }
      }
    }
    if (!this.destination) this.destinationRing?.clear();
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
    const dt = Math.min(delta / 1000, 0.1);
    if (this.canAct()) {
      this.move(dt);
      store.tick(dt);
    }
    this.syncActors(time);
    if (this.activeZone === "village") {
      const farm = this.objectSprites.get("property");
      if (farm && this.textures.exists("farm-empty"))
        farm.setTexture(
          store.state.property.plantedAt !== null ? "farm" : "farm-empty",
        );
      this.propertyHouse?.setVisible(store.state.property.building);
    }
    if (this.scenic) {
      this.cameras.main.centerOn(
        1190 + Math.sin(time / 50000) * 75,
        855 + Math.sin(time / 39000) * 25,
      );
    }
    this.updateMarker(time);
    const hour = store.state.minutes / 60;
    const dark = this.scenic
      ? 0
      : hour < 6 || hour > 19
        ? 0.32
        : hour > 17
          ? (hour - 17) * 0.1
          : 0;
    this.night?.setAlpha(dark);
    this.motes.forEach((mote, index) => {
      const seed = mote.getData("seed") as number;
      const w = this.activeZone === "village" ? WORLD_W : 900;
      mote.setPosition(
        (mote.getData("startX") +
          time / 190 +
          Math.sin(time / 3700 + seed) * 17) %
          w,
        mote.getData("startY") + Math.sin(time / 2200 + seed) * 30,
      );
      mote.setAlpha(
        (0.16 + Math.sin(time / 1600 + index) * 0.11) * (dark ? 1.8 : 1),
      );
    });
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
    let target: { x: number; y: number } | undefined;
    if (nearest.id === "exit") target = { x: 450, y: 790 };
    else
      target =
        store.state.npcs.find((npc) => npc.id === nearest.id) ||
        OBJECTS.find((obj) => obj.id === nearest.id);
    if (!target) return;
    const label = `${nearest.label}  ·  E`;
    if (label !== this.markerLabel) {
      this.markerText.setText(label);
      this.markerLabel = label;
    }
    const isPerson = store.state.npcs.some((npc) => npc.id === nearest.id);
    this.marker
      .setPosition(
        target.x,
        target.y + (isPerson ? -88 : -40) + Math.sin(time / 380) * 3,
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
    game.destroy(true);
    worldInput.x = 0;
    worldInput.y = 0;
  };
}

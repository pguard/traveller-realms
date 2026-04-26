import Phaser from "phaser";
import { playSound, unlockAudio } from "../game/audio";
import {
  addSeals,
  getEquippedLoadout,
  getSealBalance,
  prepareEquippedLoadout
} from "../game/progress";

type PlatformDef = {
  x: number;
  y: number;
  width: number;
  height?: number;
};

type OctopusDef = {
  amplitude: number;
  aggroRange: number;
  speed: number;
  x: number;
  xAmplitude: number;
  y: number;
};

type BubbleDef = {
  x: number;
  y: number;
};

type UnderwaterKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  S: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  SHIFT: Phaser.Input.Keyboard.Key;
};

const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 720;
const DASH_SPEED = 540;

export class UnderwaterRealmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private goalGate!: Phaser.Physics.Arcade.Sprite;
  private reefs!: Phaser.Physics.Arcade.StaticGroup;
  private octopi!: Phaser.Physics.Arcade.Group;
  private seals!: Phaser.Physics.Arcade.Group;
  private bubbles!: Phaser.Physics.Arcade.StaticGroup;
  private currentGraphics!: Phaser.GameObjects.Graphics;
  private currentHighlightGraphics!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: UnderwaterKeys;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private shopText!: Phaser.GameObjects.Text;
  private sealCount = 0;
  private deaths = 0;
  private damageCooldown = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashDirection = 1;
  private armorGuardAvailable = false;
  private armorUpgradeKnown = false;
  private swordEquipped = false;
  private finished = false;
  private currentFlow = new Phaser.Math.Vector2(0, 0);
  private nextCurrentVisualRefresh = 0;

  constructor() {
    super("UnderwaterRealmScene");
  }

  preload(): void {
    this.createTextures();
  }

  create(): void {
    unlockAudio(this);
    this.finished = false;
    this.sealCount = 0;
    this.deaths = 0;
    this.damageCooldown = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDirection = 1;
    this.refreshLoadout(true);

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#0b3f60");

    this.addBackdrop();
    this.events.off("resume");
    this.events.on("resume", this.handleResume, this);

    this.reefs = this.physics.add.staticGroup();
    this.octopi = this.physics.add.group({
      allowGravity: false
    });
    this.seals = this.physics.add.group({
      allowGravity: false
    });
    this.bubbles = this.physics.add.staticGroup();

    this.buildLevel();

    this.player = this.physics.add.sprite(160, 360, "diver-knight");
    this.player.setCollideWorldBounds(true);
    this.player.setDrag(900, 900);
    this.player.setMaxVelocity(380, 290);
    this.player.setSize(28, 48);
    this.player.setOffset(18, 12);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.goalGate = this.physics.add.sprite(4040, 350, "underwater-gate");
    (this.goalGate.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.goalGate.setImmovable(true);

    this.physics.add.collider(this.player, this.reefs);
    this.physics.add.overlap(this.player, this.octopi, (_obj1, obj2) => this.handleOctopusContact(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.seals, (_obj1, obj2) => this.collectSeal(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.bubbles, (_obj1, obj2) => this.touchBubble(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.goalGate, this.finishLevel, undefined, this);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keys = this.input.keyboard?.addKeys("A,D,S,W,R,SHIFT") as UnderwaterKeys;
    this.dashKey = this.keys.SHIFT;
    this.restartKey = this.keys.R;

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -120, 40);

    this.hudText = this.add
      .text(28, 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#f5fffe",
        stroke: "#14364a",
        strokeThickness: 5
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.messageText = this.add
      .text(640, 86, "Swim through the underwater world, dodge the octopi, and ride the currents.", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#ecfffe",
        align: "center",
        stroke: "#14364a",
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(30);

    this.shopText = this.add
      .text(1238, 28, "", {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "20px",
        color: "#244332",
        backgroundColor: "#f7f0cf",
        padding: { x: 12, y: 8 }
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(31)
      .setInteractive({ useHandCursor: true });

    this.shopText.on("pointerdown", () => {
      playSound(this, "select");
      this.openShop();
    });

    this.time.delayedCall(4200, () => {
      if (!this.finished) {
        this.messageText.setText("Use up and down to swim, and slip through the octopus lanes.");
      }
    });

    this.time.delayedCall(8600, () => {
      if (!this.finished) {
        this.messageText.setText("");
      }
    });

    this.updateHud();
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.scene.restart();
      return;
    }

    this.updateOctopi();

    if (this.finished) {
      this.player.setVelocity(0, 0);
      return;
    }

    if (this.damageCooldown > 0) {
      this.damageCooldown = Math.max(0, this.damageCooldown - dt);
      this.player.setAlpha(
        this.damageCooldown > 0 && Math.floor(this.damageCooldown * 24) % 2 === 0 ? 0.45 : 1
      );
    } else {
      this.player.setAlpha(1);
    }

    if (this.dashCooldown > 0) {
      this.dashCooldown -= dt;
    }

    if (this.dashTimer > 0) {
      this.applyCurrentForce(dt, 0.28);
      this.dashTimer -= dt;
      this.player.setVelocity(
        this.dashDirection * DASH_SPEED + this.currentFlow.x * 0.45,
        this.currentFlow.y * 0.45
      );
      if (this.dashTimer <= 0) {
        this.player.clearTint();
      }
      this.updateHud();
      return;
    }

    const moveLeft = this.cursors.left.isDown || this.keys.A.isDown;
    const moveRight = this.cursors.right.isDown || this.keys.D.isDown;
    const moveUp = this.cursors.up.isDown || this.keys.W.isDown;
    const moveDown = this.cursors.down.isDown || this.keys.S.isDown;
    const wantsDash = Phaser.Input.Keyboard.JustDown(this.dashKey);

    const xInput = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    const yInput = (moveDown ? 1 : 0) - (moveUp ? 1 : 0);

    const current = this.sampleCurrentField(this.player.x, this.player.y, this.time.now);
    this.currentFlow.copy(current);
    this.player.setAcceleration(xInput * 1080 + current.x * 6.5, yInput * 900 + current.y * 6);
    this.applyCurrentForce(dt);

    if (xInput !== 0) {
      this.dashDirection = xInput > 0 ? 1 : -1;
      this.player.setFlipX(xInput < 0);
    }

    if (wantsDash && this.dashCooldown <= 0) {
      this.dashTimer = 0.18;
      this.dashCooldown = 0.8;
      this.player.setTint(0xbde8ff);
      playSound(this, "dash");
    }

    this.updateHud();
  }

  private handleOctopusContact(
    octopusObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const octopus = octopusObject as Phaser.Physics.Arcade.Sprite;

    if (!octopus.active) {
      return;
    }

    if (this.swordEquipped) {
      octopus.disableBody(true, true);
      this.showMessage("Sword strike!");
      playSound(this, "select");
      return;
    }

    if (this.damageCooldown > 0) {
      return;
    }

    if (this.armorUpgradeKnown && this.armorGuardAvailable) {
      this.armorGuardAvailable = false;
      this.damageCooldown = 0.8;
      this.player.setVelocity(-220, -120);
      this.showMessage("Your armor absorbed the octopus hit.");
      playSound(this, "checkpoint");
      this.updateHud();
      return;
    }

    this.respawnFromOctopus();
    playSound(this, "hurt");
    this.updateHud();
  }

  private respawnFromOctopus(): void {
    this.deaths += 1;
    this.damageCooldown = 0.9;
    this.player.setPosition(160, 360);
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0, 0);
    this.armorGuardAvailable = this.armorUpgradeKnown;
    this.showMessage("An octopus caught you.");
    this.cameras.main.flash(260, 184, 240, 255);
  }

  private collectSeal(
    sealObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const seal = sealObject as Phaser.Physics.Arcade.Image;
    seal.disableBody(true, true);
    this.sealCount += 1;
    addSeals(1);
    this.showMessage("Baby seal rescued.");
    playSound(this, "seal");
    this.updateHud();
  }

  private touchBubble(
    bubbleObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const bubble = bubbleObject as Phaser.Physics.Arcade.Sprite;
    bubble.setScale(1.08);
    this.player.setVelocityY(Math.min((this.player.body as Phaser.Physics.Arcade.Body).velocity.y - 180, -120));
    playSound(this, "splash");
    this.tweens.add({
      targets: bubble,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: "Sine.Out"
    });
  }

  private finishLevel(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);
    this.player.setAcceleration(0, 0);
    this.player.clearTint();
    this.showMessage("The water gate opens into the royal celebration.", true);
    this.cameras.main.flash(650, 210, 250, 255);
    playSound(this, "rescue");
    this.updateHud();

    this.time.delayedCall(1500, () => {
      this.scene.start("CelebrationScene", {
        realm: "underwater"
      });
    });
  }

  private showMessage(text: string, sticky = false): void {
    this.messageText.setText(text);

    if (!sticky) {
      this.time.delayedCall(2400, () => {
        if (!this.finished && this.messageText.text === text) {
          this.messageText.setText("");
        }
      });
    }
  }

  private updateHud(): void {
    const dashState = this.dashCooldown > 0 ? "recharging" : "ready";
    const armorState = this.armorUpgradeKnown ? (this.armorGuardAvailable ? "guard up" : "guard spent") : "none";
    const gear = [
      this.swordEquipped ? "sword" : null,
      this.armorUpgradeKnown ? "armor" : null
    ]
      .filter(Boolean)
      .join(", ") || "none";
    const currentDirection =
      Math.abs(this.currentFlow.x) > Math.abs(this.currentFlow.y)
        ? this.currentFlow.x >= 0
          ? "east"
          : "west"
        : this.currentFlow.y >= 0
          ? "down"
          : "up";
    const currentStrength = Math.round(this.currentFlow.length());
    this.hudText.setText(
      `Level seals ${this.sealCount}/4   Wallet ${getSealBalance()}   Deaths ${this.deaths}   Armor ${armorState}   Gear ${gear}   Current ${currentDirection} ${currentStrength}   Dash ${dashState}`
    );
    this.shopText.setText(`Seal Shop ${getSealBalance()}`);
  }

  private buildLevel(): void {
    const reefPlatforms: PlatformDef[] = [
      { x: 200, y: 640, width: 320, height: 120 },
      { x: 910, y: 650, width: 260, height: 100 },
      { x: 1660, y: 640, width: 240, height: 120 },
      { x: 2360, y: 640, width: 240, height: 120 },
      { x: 3140, y: 650, width: 300, height: 100 },
      { x: 3940, y: 640, width: 320, height: 120 },
      { x: 1080, y: 120, width: 200, height: 80 },
      { x: 2780, y: 100, width: 220, height: 90 },
      { x: 650, y: 360, width: 170, height: 44 },
      { x: 1480, y: 260, width: 190, height: 42 },
      { x: 2050, y: 470, width: 170, height: 44 },
      { x: 2930, y: 336, width: 190, height: 42 },
      { x: 3560, y: 236, width: 170, height: 40 }
    ];

    reefPlatforms.forEach((platform) => {
      const reef = this.reefs.create(platform.x, platform.y, "reef");
      const height = platform.height ?? 80;
      reef.setDisplaySize(platform.width, height).refreshBody().setDepth(7);
    });

    const octopi: OctopusDef[] = [
      { x: 760, y: 248, amplitude: 68, xAmplitude: 54, speed: 0.008, aggroRange: 210 },
      { x: 1160, y: 500, amplitude: 78, xAmplitude: 72, speed: 0.0067, aggroRange: 220 },
      { x: 1530, y: 202, amplitude: 66, xAmplitude: 64, speed: 0.0083, aggroRange: 210 },
      { x: 1930, y: 418, amplitude: 92, xAmplitude: 58, speed: 0.007, aggroRange: 220 },
      { x: 2380, y: 278, amplitude: 82, xAmplitude: 66, speed: 0.0077, aggroRange: 210 },
      { x: 2760, y: 506, amplitude: 74, xAmplitude: 70, speed: 0.0063, aggroRange: 220 },
      { x: 3180, y: 212, amplitude: 70, xAmplitude: 56, speed: 0.008, aggroRange: 210 },
      { x: 3560, y: 430, amplitude: 88, xAmplitude: 68, speed: 0.0073, aggroRange: 220 },
      { x: 3860, y: 278, amplitude: 72, xAmplitude: 52, speed: 0.0083, aggroRange: 210 }
    ];

    octopi.forEach((octopusDef, index) => {
      const octopus = this.octopi.create(octopusDef.x, octopusDef.y, "octopus") as Phaser.Physics.Arcade.Sprite;
      octopus.setData("baseX", octopusDef.x);
      octopus.setData("baseY", octopusDef.y);
      octopus.setData("amplitude", octopusDef.amplitude);
      octopus.setData("xAmplitude", octopusDef.xAmplitude);
      octopus.setData("speed", octopusDef.speed);
      octopus.setData("aggroRange", octopusDef.aggroRange);
      octopus.setData("phase", index * 0.8);
      octopus.setDepth(9);
      (octopus.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      (octopus.body as Phaser.Physics.Arcade.Body).setSize(42, 42).setOffset(7, 6);
    });

    const seals: BubbleDef[] = [
      { x: 980, y: 280 },
      { x: 2140, y: 300 },
      { x: 3000, y: 544 },
      { x: 3440, y: 240 }
    ];

    seals.forEach(({ x, y }) => {
      const seal = this.seals.create(x, y, "seal");
      (seal.body as Phaser.Physics.Arcade.Body).setSize(26, 22).setOffset(1, 4);
      this.tweens.add({
        targets: seal,
        y: y - 10,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    const bubbles: BubbleDef[] = [
      { x: 830, y: 568 },
      { x: 1220, y: 520 },
      { x: 1740, y: 188 },
      { x: 2840, y: 540 },
      { x: 3500, y: 500 }
    ];

    bubbles.forEach(({ x, y }) => {
      const bubble = this.bubbles.create(x, y, "bubble-column");
      bubble.setDepth(8);
    });
  }

  private updateOctopi(): void {
    this.octopi.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const octopus = child as Phaser.Physics.Arcade.Sprite | null;
      if (!octopus || !octopus.active) {
        return true;
      }

      const baseX = octopus.getData("baseX") as number;
      const baseY = octopus.getData("baseY") as number;
      const amplitude = octopus.getData("amplitude") as number;
      const xAmplitude = octopus.getData("xAmplitude") as number;
      const speed = octopus.getData("speed") as number;
      const aggroRange = octopus.getData("aggroRange") as number;
      const phase = octopus.getData("phase") as number;
      const elapsed = this.time.now * speed + phase;
      const closeToPlayer =
        Math.abs(this.player.x - baseX) < aggroRange && Math.abs(this.player.y - baseY) < 150;
      const chaseX = closeToPlayer
        ? Phaser.Math.Clamp((this.player.x - baseX) * 0.053, -xAmplitude * 0.22, xAmplitude * 0.22)
        : 0;
      const chaseY = closeToPlayer ? Phaser.Math.Clamp((this.player.y - baseY) * 0.033, -9, 9) : 0;
      octopus.x = baseX + Math.cos(elapsed * 0.88) * xAmplitude + chaseX;
      octopus.y = baseY + Math.sin(elapsed) * amplitude + chaseY;
      octopus.setRotation(Math.sin(elapsed) * 0.08);
      octopus.setFlipX(this.player.x < octopus.x);
      return true;
    });
  }

  private openShop(): void {
    this.scene.launch("ShopScene", {
      returnScene: this.sys.settings.key
    });
    this.scene.pause();
  }

  private handleResume(): void {
    this.refreshLoadout();
    this.updateHud();
  }

  private refreshLoadout(consumeSword = false): void {
    const loadout = consumeSword ? prepareEquippedLoadout() : getEquippedLoadout();

    if (loadout.armor && !this.armorUpgradeKnown) {
      this.armorGuardAvailable = true;
    } else if (!loadout.armor) {
      this.armorGuardAvailable = false;
    }

    this.armorUpgradeKnown = loadout.armor;
    this.swordEquipped = loadout.sword;
  }

  private addBackdrop(): void {
    const water = this.add.graphics();
    water.fillGradientStyle(0x0a4b73, 0x0a4b73, 0x08314f, 0x051d31, 1);
    water.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const light = this.add.graphics();
    light.fillStyle(0xbef6ff, 0.12);
    for (let i = 0; i < 10; i += 1) {
      light.fillEllipse(120 + i * 420, 80, 220, 120);
    }
    light.setScrollFactor(0.2);

    this.currentGraphics = this.add.graphics().setDepth(2);
    this.currentHighlightGraphics = this.add.graphics().setDepth(3);
    this.updateCurrentVisuals(true);

    const seaweed = this.add.graphics();
    seaweed.lineStyle(6, 0x3ba174, 0.7);
    for (let i = 0; i < 30; i += 1) {
      const x = 80 + i * 140;
      seaweed.beginPath();
      seaweed.moveTo(x, 720);
      seaweed.lineTo(x - 18, 620);
      seaweed.lineTo(x + 10, 520);
      seaweed.strokePath();
    }
    seaweed.setScrollFactor(0.7);
  }

  private sampleCurrentField(x: number, y: number, time: number): Phaser.Math.Vector2 {
    const xNorm = x / WORLD_WIDTH;
    const yNorm = y / WORLD_HEIGHT;
    const timeA = time * 0.00016;
    const timeB = time * 0.00011;
    const angle =
      Math.sin(timeA + xNorm * 7.4) * 1.1 +
      Math.cos(timeB + yNorm * 8.6) * 0.8 +
      Math.sin(timeA * 0.7 + (xNorm + yNorm) * 9.3) * 0.55;
    const direction = new Phaser.Math.Vector2(
      Math.cos(angle) * 0.95 + Math.sin(timeB + yNorm * 6.8) * 0.45,
      Math.sin(angle) * 0.7 + Math.cos(timeA + xNorm * 5.6) * 0.55
    ).normalize();
    const speed =
      34 +
      22 * Math.sin(timeA + xNorm * 11.2) +
      18 * Math.cos(timeB * 1.2 + yNorm * 12.4) +
      10 * Math.sin((timeA + timeB) * 0.9 + (xNorm - yNorm) * 7.1);
    return direction.scale(Phaser.Math.Clamp(speed, 18, 82));
  }

  private applyCurrentForce(dt: number, multiplier = 1): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const current = this.sampleCurrentField(this.player.x, this.player.y, this.time.now);
    this.currentFlow.copy(current);
    body.velocity.x = Phaser.Math.Clamp(body.velocity.x + current.x * dt * multiplier, -420, 420);
    body.velocity.y = Phaser.Math.Clamp(body.velocity.y + current.y * dt * multiplier, -320, 320);
    this.updateCurrentVisuals();
  }

  private updateCurrentVisuals(force = false): void {
    if (!force && this.time.now < this.nextCurrentVisualRefresh) {
      return;
    }

    this.nextCurrentVisualRefresh = this.time.now + 140;
    this.currentGraphics.clear();
    this.currentHighlightGraphics.clear();

    const rows = 4;
    const columns = 10;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const anchorX = 190 + column * 400 + (row % 2) * 90;
        const anchorY = 120 + row * 150;
        const flow = this.sampleCurrentField(anchorX, anchorY, this.time.now);
        const direction = flow.clone().normalize();
        const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x);
        const lineLength = Phaser.Math.Linear(42, 92, Phaser.Math.Clamp((flow.length() - 18) / 64, 0, 1));
        const curl = Math.sin(this.time.now * 0.0012 + anchorX * 0.014 + anchorY * 0.018) * 12;
        const points: Phaser.Math.Vector2[] = [];

        for (let step = 0; step <= 5; step += 1) {
          const t = step / 5;
          const centerOffset = (t - 0.5) * lineLength;
          const wave = Math.sin(t * Math.PI * 2 + this.time.now * 0.001 + row) * curl * (1 - Math.abs(t - 0.5) * 1.35);
          points.push(
            new Phaser.Math.Vector2(
              anchorX + direction.x * centerOffset + perpendicular.x * wave,
              anchorY + direction.y * centerOffset + perpendicular.y * wave
            )
          );
        }

        this.currentGraphics.lineStyle(4, 0x7cdfff, 0.18);
        this.currentGraphics.strokePoints(points, false, false);
        this.currentHighlightGraphics.lineStyle(2, 0xe9ffff, 0.35);
        this.currentHighlightGraphics.strokePoints(points, false, false);
        this.currentHighlightGraphics.fillStyle(0xe9ffff, 0.42);
        this.currentHighlightGraphics.fillCircle(points[points.length - 1].x, points[points.length - 1].y, 3);
      }
    }
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    graphics.clear();
    graphics.fillStyle(0x7b5e55, 1);
    graphics.fillRoundedRect(0, 24, 80, 56, 20);
    graphics.fillStyle(0xe28c67, 1);
    graphics.fillCircle(14, 24, 18);
    graphics.fillCircle(34, 16, 16);
    graphics.fillCircle(58, 24, 18);
    graphics.fillStyle(0xffc394, 0.9);
    graphics.fillCircle(28, 32, 10);
    graphics.generateTexture("reef", 80, 80);

    graphics.clear();
    graphics.fillStyle(0xb866d9, 1);
    graphics.fillCircle(28, 24, 20);
    graphics.fillStyle(0xe7b8ff, 1);
    graphics.fillCircle(20, 20, 4);
    graphics.fillCircle(36, 20, 4);
    graphics.fillStyle(0x5b2d78, 1);
    graphics.fillCircle(20, 20, 2);
    graphics.fillCircle(36, 20, 2);
    for (let i = 0; i < 6; i += 1) {
      graphics.fillRoundedRect(8 + i * 7, 34, 5, 20, 4);
    }
    graphics.generateTexture("octopus", 56, 56);

    graphics.clear();
    graphics.fillStyle(0xa4efff, 0.55);
    graphics.fillRoundedRect(8, 0, 24, 80, 12);
    graphics.fillStyle(0xd9ffff, 0.6);
    graphics.fillCircle(20, 16, 8);
    graphics.fillCircle(20, 34, 6);
    graphics.fillCircle(20, 52, 7);
    graphics.generateTexture("bubble-column", 40, 80);

    graphics.clear();
    graphics.fillStyle(0xf2f4f6, 1);
    graphics.fillEllipse(20, 16, 30, 20);
    graphics.fillEllipse(14, 12, 18, 14);
    graphics.fillStyle(0xd7e0e6, 1);
    graphics.fillEllipse(24, 20, 18, 10);
    graphics.fillStyle(0x1f2b35, 1);
    graphics.fillCircle(10, 11, 2);
    graphics.fillCircle(16, 11, 2);
    graphics.fillStyle(0x95b7c9, 1);
    graphics.fillCircle(20, 23, 3);
    graphics.generateTexture("seal", 40, 28);

    graphics.clear();
    graphics.fillStyle(0xf2d0c1, 1);
    graphics.fillCircle(30, 14, 8);
    graphics.fillStyle(0x5d3f2b, 1);
    graphics.fillEllipse(30, 10, 24, 16);
    graphics.fillRect(18, 12, 6, 20);
    graphics.fillStyle(0xf2ca55, 1);
    graphics.fillTriangle(24, 4, 38, 4, 31, 0);
    graphics.fillStyle(0x3f92cf, 1);
    graphics.fillRoundedRect(18, 22, 24, 24, 8);
    graphics.fillStyle(0xbff5ff, 1);
    graphics.fillRoundedRect(38, 18, 16, 24, 7);
    graphics.fillStyle(0xeefbff, 1);
    graphics.fillRoundedRect(20, 24, 20, 10, 5);
    graphics.fillStyle(0x25597f, 1);
    graphics.fillRect(18, 45, 8, 16);
    graphics.fillRect(34, 45, 8, 16);
    graphics.generateTexture("diver-knight", 64, 64);

    graphics.clear();
    graphics.fillStyle(0xa3f7ff, 1);
    graphics.fillRoundedRect(8, 0, 64, 92, 14);
    graphics.fillStyle(0x6fc6e4, 1);
    graphics.fillCircle(40, 30, 12);
    graphics.lineStyle(4, 0x6fc6e4, 1);
    graphics.strokeEllipse(40, 50, 34, 24);
    graphics.beginPath();
    graphics.moveTo(24, 66);
    graphics.lineTo(56, 74);
    graphics.strokePath();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillEllipse(18, -2, 24, 12);
    graphics.fillEllipse(60, -2, 24, 12);
    graphics.generateTexture("underwater-gate", 80, 96);

    graphics.destroy();
  }
}

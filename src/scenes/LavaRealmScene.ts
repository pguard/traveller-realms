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
  texture?: string;
};

type MovingPlatformDef = {
  x: number;
  y: number;
  width: number;
  deltaX: number;
  deltaY: number;
  duration: number;
};

type EnemyDef = {
  x: number;
  y: number;
  patrolLeft: number;
  patrolRight: number;
  speed: number;
  aggroRange: number;
};

type HazardDef = {
  x: number;
  y: number;
  width: number;
};

type FireJetDef = {
  x: number;
  y: number;
  interval: number;
  activeDuration: number;
  delay: number;
};

type LavaKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  SHIFT: Phaser.Input.Keyboard.Key;
  ENTER: Phaser.Input.Keyboard.Key;
};

const WORLD_WIDTH = 4300;
const WORLD_HEIGHT = 720;
const PLAYER_SPEED = 390;
const JUMP_VELOCITY = -810;
const WALL_JUMP_X = 460;
const WALL_JUMP_Y = -770;
const DASH_SPEED = 780;
const CHECKPOINT_TINT = 0xffd46d;

export class LavaRealmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private gate!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private bouncePads!: Phaser.Physics.Arcade.StaticGroup;
  private lavaPools!: Phaser.Physics.Arcade.StaticGroup;
  private fireJets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private seals!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: LavaKeys;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private shopText!: Phaser.GameObjects.Text;
  private respawnPoint = new Phaser.Math.Vector2(150, 560);
  private sealCount = 0;
  private deaths = 0;
  private checkpointsHit = 0;
  private airJumpsRemaining = 1;
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private damageCooldown = 0;
  private dashDirection = 1;
  private wallSide: -1 | 0 | 1 = 0;
  private armorGuardAvailable = false;
  private armorUpgradeKnown = false;
  private swordEquipped = false;
  private extraAirJumps = 0;
  private finished = false;

  constructor() {
    super("LavaRealmScene");
  }

  preload(): void {
    this.createTextures();
  }

  create(): void {
    unlockAudio(this);
    this.finished = false;
    this.respawnPoint.set(150, 560);
    this.sealCount = 0;
    this.deaths = 0;
    this.checkpointsHit = 0;
    this.airJumpsRemaining = 1;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.damageCooldown = 0;
    this.wallSide = 0;
    this.refreshLoadout(true);
    this.airJumpsRemaining = this.getAvailableAirJumps();

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#1c0808");

    this.addBackdrop();
    this.events.off("resume");
    this.events.on("resume", this.handleResume, this);

    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.bouncePads = this.physics.add.staticGroup();
    this.lavaPools = this.physics.add.staticGroup();
    this.fireJets = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.enemies = this.physics.add.group();
    this.seals = this.physics.add.group({
      allowGravity: false
    });
    this.checkpoints = this.physics.add.staticGroup();

    this.buildLevel();

    this.player = this.physics.add.sprite(this.respawnPoint.x, this.respawnPoint.y, "lava-knight");
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1600);
    this.player.setMaxVelocity(PLAYER_SPEED + 30, 1260);
    this.player.setSize(28, 48);
    this.player.setOffset(18, 12);

    this.gate = this.physics.add.sprite(4070, 184, "lava-gate");
    (this.gate.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.gate.setImmovable(true);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingPlatforms);
    this.physics.add.collider(
      this.player,
      this.bouncePads,
      (_obj1, obj2) => this.touchBouncePad(obj2),
      undefined,
      this
    );
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.enemies, this.movingPlatforms);
    this.physics.add.overlap(this.player, this.lavaPools, () => this.tryDamage("The lava swallowed the path."), undefined, this);
    this.physics.add.overlap(this.player, this.fireJets, (_obj1, obj2) => this.touchFireJet(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.enemies, (_obj1, obj2) => this.handleEnemyContact(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.seals, (_obj1, obj2) => this.collectSeal(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.checkpoints, (_obj1, obj2) => this.activateCheckpoint(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.gate, this.finishLevel, undefined, this);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keys = this.input.keyboard?.addKeys("A,D,W,R,SHIFT,ENTER") as LavaKeys;
    this.jumpKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;
    this.dashKey = this.keys.SHIFT;
    this.restartKey = this.keys.R;

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -120, 40);

    this.hudText = this.add
      .text(28, 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#fff3d7",
        stroke: "#4f1f14",
        strokeThickness: 5
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.messageText = this.add
      .text(640, 86, "The tunnel erupts into a world of lava.", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#ffe8c6",
        align: "center",
        stroke: "#4f1f14",
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
        this.messageText.setText("Use the ash vents, moving slabs, and extra air jumps to cross the lava.");
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

    if (this.finished) {
      return;
    }

    this.updateMovingPlatforms();
    this.updateFireJets(delta);
    this.updateEnemies();

    if (this.damageCooldown > 0) {
      this.damageCooldown = Math.max(0, this.damageCooldown - dt);
      this.player.setAlpha(
        this.damageCooldown > 0 && Math.floor(this.damageCooldown * 24) % 2 === 0 ? 0.45 : 1
      );
    } else {
      this.player.setAlpha(1);
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;
    const jumpHeld = this.jumpKey.isDown || this.cursors.up.isDown || this.keys.W.isDown;

    if (onGround) {
      this.coyoteTimer = 0.16;
      this.airJumpsRemaining = this.getAvailableAirJumps();
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
    }

    if (this.dashCooldown > 0) {
      this.dashCooldown -= dt;
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.player.setVelocityY(-20);
      this.player.setVelocityX(this.dashDirection * DASH_SPEED);

      if (this.dashTimer <= 0) {
        this.player.clearTint();
      }

      this.updateHud();
      return;
    }

    const moveLeft = this.cursors.left.isDown || this.keys.A.isDown;
    const moveRight = this.cursors.right.isDown || this.keys.D.isDown;
    const wantsJump =
      Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keys.W);
    const wantsDash = Phaser.Input.Keyboard.JustDown(this.dashKey);

    if (wantsJump) {
      this.jumpBufferTimer = 0.18;
    }

    this.wallSide = 0;
    if (!onGround && body.blocked.left && moveLeft) {
      this.wallSide = -1;
    } else if (!onGround && body.blocked.right && moveRight) {
      this.wallSide = 1;
    }

    if (this.wallSide !== 0 && body.velocity.y > 110) {
      this.player.setVelocityY(110);
    }

    if (this.jumpBufferTimer > 0) {
      if (onGround || this.coyoteTimer > 0) {
        this.performJump(JUMP_VELOCITY);
      } else if (this.wallSide !== 0) {
        this.performWallJump();
      } else if (this.airJumpsRemaining > 0) {
        this.airJumpsRemaining -= 1;
        this.performJump(JUMP_VELOCITY * 0.93);
      }
    }

    if (wantsDash && this.dashCooldown <= 0) {
      const horizontalIntent = moveLeft ? -1 : moveRight ? 1 : body.velocity.x < 0 ? -1 : 1;
      this.beginDash(horizontalIntent);
      this.updateHud();
      return;
    }

    if (moveLeft === moveRight) {
      this.player.setAccelerationX(0);
      body.setDragX(onGround ? 1100 : 240);
    } else {
      this.player.setAccelerationX((moveLeft ? -1 : 1) * 1650);
      body.setDragX(onGround ? 520 : 220);
      this.dashDirection = moveLeft ? -1 : 1;
      this.player.setFlipX(moveLeft);
    }

    if (!jumpHeld && body.velocity.y < -260) {
      this.player.setVelocityY(body.velocity.y * 0.58);
    }

    if (this.player.y > WORLD_HEIGHT + 40) {
      this.tryDamage("The heat sent you into the chasm.");
      return;
    }

    this.updateHud();
  }

  private performJump(strength: number): void {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.player.setVelocityY(this.getJumpStrength(strength));
    playSound(this, "jump");
  }

  private performWallJump(): void {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.player.setVelocityX(-this.wallSide * WALL_JUMP_X);
    this.player.setVelocityY(this.getJumpStrength(WALL_JUMP_Y));
    this.player.setFlipX(this.wallSide > 0);
    this.dashDirection = -this.wallSide;
    playSound(this, "jump");
  }

  private beginDash(direction: number): void {
    this.dashDirection = direction === 0 ? 1 : direction;
    this.dashTimer = 0.15;
    this.dashCooldown = 0.7;
    this.player.setVelocity(this.dashDirection * DASH_SPEED, -18);
    this.player.setAccelerationX(0);
    this.player.setTint(0xffc066);
    playSound(this, "dash");
  }

  private touchBouncePad(
    bouncePadObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const bouncePad = bouncePadObject as Phaser.Physics.Arcade.Sprite;
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    if (body.velocity.y >= -60) {
      this.player.setVelocityY(this.getJumpStrength(-980));
      this.airJumpsRemaining = this.getAvailableAirJumps();
      bouncePad.setScale(1.08, 0.84);
      this.tweens.add({
        targets: bouncePad,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: "Back.Out"
      });
      playSound(this, "jump");
    }
  }

  private touchFireJet(
    fireJetObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const fireJet = fireJetObject as Phaser.Physics.Arcade.Sprite;

    if (fireJet.getData("active")) {
      this.tryDamage("A lava jet blasted through the gap.");
    }
  }

  private handleEnemyContact(
    enemyObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body | null;

    if (!enemy.active || !enemyBody) {
      return;
    }

    const stomped = playerBody.velocity.y > 140 && playerBody.bottom <= enemyBody.top + 18;
    const slashed = this.swordEquipped;

    if (stomped || slashed) {
      this.stompEnemy(enemy);
      return;
    }

    this.tryDamage("A magma beast burst across your path.");
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active) {
      return;
    }

    enemy.disableBody(true, true);
    this.player.setVelocityY(-540);
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.showMessage(this.swordEquipped ? "Sword strike!" : "Magma beast defeated.");
    playSound(this, "select");
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

  private activateCheckpoint(
    checkpointObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const checkpoint = checkpointObject as Phaser.Physics.Arcade.Sprite;

    if (checkpoint.getData("active")) {
      return;
    }

    this.respawnPoint.set(checkpoint.x, checkpoint.y - 34);
    checkpoint.setTint(CHECKPOINT_TINT);
    checkpoint.setData("active", true);
    this.checkpointsHit += 1;
    this.armorGuardAvailable = this.armorUpgradeKnown;
    this.showMessage("Heat marker reached.");
    playSound(this, "checkpoint");
    this.updateHud();
  }

  private tryDamage(reason: string): void {
    if (this.finished || this.damageCooldown > 0) {
      return;
    }

    if (this.armorUpgradeKnown && this.armorGuardAvailable) {
      this.armorGuardAvailable = false;
      this.damageCooldown = 0.8;
      this.player.setVelocityY(-420);
      this.player.setVelocityX(this.player.flipX ? 240 : -240);
      this.showMessage("Your armor absorbed the hit.");
      playSound(this, "checkpoint");
      this.updateHud();
      return;
    }

    this.deaths += 1;
    this.player.setVelocity(0, 0);
    this.player.setAccelerationX(0);
    this.player.clearTint();
    this.player.setPosition(this.respawnPoint.x, this.respawnPoint.y);
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.armorGuardAvailable = this.armorUpgradeKnown;
    this.dashTimer = 0;
    this.dashCooldown = 0.25;
    this.damageCooldown = 1;
    this.showMessage(reason);
    this.cameras.main.shake(180, 0.006);
    playSound(this, "hurt");
    this.updateHud();
  }

  private finishLevel(): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);
    this.player.setAccelerationX(0);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.showMessage("The lava gate opens into the royal celebration.", true);
    this.cameras.main.flash(650, 255, 210, 150);
    playSound(this, "rescue");
    this.updateHud();

    this.time.delayedCall(1500, () => {
      this.scene.start("CelebrationScene", {
        realm: "lava"
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
      this.armorUpgradeKnown ? "armor" : null,
      this.extraAirJumps > 0 ? `air+${this.extraAirJumps}` : null
    ]
      .filter(Boolean)
      .join(", ") || "none";
    this.hudText.setText(
      `Level seals ${this.sealCount}/4   Wallet ${getSealBalance()}   Falls ${this.deaths}   Armor ${armorState}   Gear ${gear}   Dash ${dashState}`
    );
    this.shopText.setText(`Seal Shop ${getSealBalance()}`);
  }

  private buildLevel(): void {
    const groundSegments: PlatformDef[] = [
      { x: 210, y: 680, width: 340, texture: "lava-ground" },
      { x: 820, y: 680, width: 250, texture: "lava-ground" },
      { x: 1490, y: 680, width: 210, texture: "lava-ground" },
      { x: 2150, y: 680, width: 220, texture: "lava-ground" },
      { x: 2890, y: 680, width: 230, texture: "lava-ground" },
      { x: 3540, y: 680, width: 250, texture: "lava-ground" },
      { x: 4060, y: 680, width: 260, texture: "lava-ground" }
    ];

    const upperPlatforms: PlatformDef[] = [
      { x: 520, y: 556, width: 150, texture: "lava-platform" },
      { x: 860, y: 492, width: 124, texture: "lava-platform" },
      { x: 1140, y: 430, width: 124, texture: "lava-platform" },
      { x: 1420, y: 364, width: 130, texture: "lava-platform" },
      { x: 1720, y: 308, width: 130, texture: "lava-platform" },
      { x: 2035, y: 384, width: 150, texture: "lava-platform" },
      { x: 2340, y: 322, width: 126, texture: "lava-platform" },
      { x: 2660, y: 260, width: 130, texture: "lava-platform" },
      { x: 2960, y: 342, width: 150, texture: "lava-platform" },
      { x: 3290, y: 420, width: 130, texture: "lava-platform" },
      { x: 3600, y: 340, width: 130, texture: "lava-platform" },
      { x: 3920, y: 276, width: 180, texture: "lava-platform" }
    ];

    [...groundSegments, ...upperPlatforms].forEach((platform) => {
      const sprite = this.platforms.create(platform.x, platform.y, platform.texture ?? "lava-ground");
      const height = platform.height ?? 28;
      sprite.setDisplaySize(platform.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, platform.width, height);
    });

    const basaltWalls: PlatformDef[] = [
      { x: 980, y: 590, width: 28, height: 200, texture: "lava-wall" },
      { x: 1880, y: 552, width: 28, height: 250, texture: "lava-wall" },
      { x: 3090, y: 540, width: 28, height: 220, texture: "lava-wall" }
    ];

    basaltWalls.forEach((wall) => {
      const sprite = this.platforms.create(wall.x, wall.y, wall.texture ?? "lava-wall");
      const height = wall.height ?? 28;
      sprite.setDisplaySize(wall.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, wall.width, height);
    });

    const lavaPools: HazardDef[] = [
      { x: 450, y: 696, width: 120 },
      { x: 1230, y: 696, width: 120 },
      { x: 2430, y: 696, width: 120 },
      { x: 3330, y: 696, width: 120 },
      { x: 3860, y: 696, width: 120 }
    ];

    lavaPools.forEach((hazard) => {
      const count = Math.floor(hazard.width / 40);
      for (let i = 0; i < count; i += 1) {
        const pool = this.lavaPools.create(hazard.x + i * 40, hazard.y, "lava-surface");
        pool.setOrigin(0, 1).refreshBody().setDepth(6);
      }
    });

    [
      [1600, 650],
      [2520, 650],
      [3500, 650]
    ].forEach(([x, y]) => {
      const pad = this.bouncePads.create(x, y, "lava-vent");
      pad.setDepth(8);
    });

    const movingPlatforms: MovingPlatformDef[] = [
      { x: 2200, y: 500, width: 120, deltaX: 0, deltaY: -140, duration: 2400 },
      { x: 2950, y: 390, width: 126, deltaX: 180, deltaY: 0, duration: 2200 },
      { x: 3540, y: 312, width: 120, deltaX: 150, deltaY: 0, duration: 2200 }
    ];

    movingPlatforms.forEach((platform) => {
      const sprite = this.movingPlatforms.create(platform.x, platform.y, "lava-moving-platform") as Phaser.Physics.Arcade.Sprite;
      sprite.setDisplaySize(platform.width, 24);
      this.tuneDynamicPlatformBody(sprite, platform.width, 24);
      sprite.setImmovable(true);
      sprite.setData("originX", platform.x);
      sprite.setData("originY", platform.y);
      sprite.setData("deltaX", platform.deltaX);
      sprite.setData("deltaY", platform.deltaY);
      sprite.setData("duration", platform.duration);
      sprite.setData("elapsed", Phaser.Math.Between(0, platform.duration));
      sprite.setDepth(8);
    });

    const enemies: EnemyDef[] = [
      { x: 850, y: 630, patrolLeft: 770, patrolRight: 930, speed: 62, aggroRange: 180 },
      { x: 2360, y: 272, patrolLeft: 2290, patrolRight: 2430, speed: 72, aggroRange: 180 },
      { x: 3600, y: 290, patrolLeft: 3540, patrolRight: 3660, speed: 76, aggroRange: 180 }
    ];

    enemies.forEach((enemyDef) => {
      const enemy = this.enemies.create(enemyDef.x, enemyDef.y, "lava-beast") as Phaser.Physics.Arcade.Sprite;
      enemy.setCollideWorldBounds(true);
      enemy.setDragX(1600);
      enemy.setMaxVelocity(150, 900);
      enemy.setSize(36, 34);
      enemy.setOffset(10, 12);
      enemy.setData("patrolLeft", enemyDef.patrolLeft);
      enemy.setData("patrolRight", enemyDef.patrolRight);
      enemy.setData("speed", enemyDef.speed);
      enemy.setData("aggroRange", enemyDef.aggroRange);
      enemy.setData("direction", -1);
      enemy.setDepth(9);
    });

    const fireJets: FireJetDef[] = [
      { x: 1160, y: 650, interval: 2500, activeDuration: 760, delay: 0 },
      { x: 2080, y: 650, interval: 2650, activeDuration: 860, delay: 420 },
      { x: 3240, y: 650, interval: 2550, activeDuration: 760, delay: 860 },
      { x: 3910, y: 246, interval: 2450, activeDuration: 720, delay: 1120 }
    ];

    fireJets.forEach((jetDef) => {
      const jet = this.fireJets.create(jetDef.x, jetDef.y, "lava-jet") as Phaser.Physics.Arcade.Sprite;
      jet.setDepth(8);
      jet.setOrigin(0.5, 1);
      jet.setData("interval", jetDef.interval);
      jet.setData("activeDuration", jetDef.activeDuration);
      jet.setData("elapsed", jetDef.delay);
      jet.setData("active", false);
      (jet.body as Phaser.Physics.Arcade.Body).setSize(24, 60);
    });

    [
      [900, 430],
      [1720, 250],
      [2660, 208],
      [3920, 228]
    ].forEach(([x, y]) => {
      const seal = this.seals.create(x, y, "seal");
      (seal.body as Phaser.Physics.Arcade.Body).setSize(26, 22).setOffset(1, 4);
      this.tweens.add({
        targets: seal,
        y: y - 8,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    [
      [2140, 626],
      [3560, 294]
    ].forEach(([x, y]) => {
      const checkpoint = this.checkpoints.create(x, y, "lava-checkpoint");
      checkpoint.setData("active", false);
      checkpoint.setDepth(10);
    });

    this.addDecorations();
  }

  private updateMovingPlatforms(): void {
    this.movingPlatforms.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const platform = child as Phaser.Physics.Arcade.Sprite | null;
      if (!platform) {
        return true;
      }

      const body = platform.body as Phaser.Physics.Arcade.Body;
      const duration = platform.getData("duration") as number;
      const elapsed = ((platform.getData("elapsed") as number) + this.game.loop.delta) % duration;
      const progress = elapsed / duration;
      const swing = Math.sin(progress * Math.PI * 2);
      const lastX = platform.x;
      const lastY = platform.y;
      const originX = platform.getData("originX") as number;
      const originY = platform.getData("originY") as number;
      const deltaX = platform.getData("deltaX") as number;
      const deltaY = platform.getData("deltaY") as number;
      const nextX = originX + swing * deltaX;
      const nextY = originY + swing * deltaY;

      platform.setData("elapsed", elapsed);
      platform.setPosition(nextX, nextY);
      body.updateFromGameObject();
      body.setVelocity(nextX - lastX, nextY - lastY);
      return true;
    });
  }

  private updateFireJets(delta: number): void {
    this.fireJets.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const jet = child as Phaser.Physics.Arcade.Sprite | null;
      if (!jet || !jet.body) {
        return true;
      }

      const interval = jet.getData("interval") as number;
      const activeDuration = jet.getData("activeDuration") as number;
      const elapsed = ((jet.getData("elapsed") as number) + delta) % interval;
      const active = elapsed < activeDuration;
      const body = jet.body as Phaser.Physics.Arcade.Body;

      jet.setData("elapsed", elapsed);
      jet.setData("active", active);
      jet.setScale(1, active ? 1 : 0.34);
      jet.setAlpha(active ? 1 : 0.42);
      body.setEnable(active);
      body.setOffset(4, active ? 0 : 42);
      body.setSize(24, active ? 60 : 18);
      return true;
    });
  }

  private updateEnemies(): void {
    this.enemies.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite | null;
      if (!enemy || !enemy.body) {
        return true;
      }

      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const dx = this.player.x - enemy.x;
      const dy = Math.abs(this.player.y - enemy.y);
      const aggroRange = enemy.getData("aggroRange") as number;
      const speed = enemy.getData("speed") as number;
      const patrolLeft = enemy.getData("patrolLeft") as number;
      const patrolRight = enemy.getData("patrolRight") as number;
      let direction = enemy.getData("direction") as number;

      if (Math.abs(dx) <= aggroRange && dy < 80) {
        direction = dx < 0 ? -1 : 1;
        body.setVelocityX(direction * (speed + 18));
      } else {
        if (enemy.x <= patrolLeft) {
          direction = 1;
        } else if (enemy.x >= patrolRight) {
          direction = -1;
        } else if (body.blocked.left) {
          direction = 1;
        } else if (body.blocked.right) {
          direction = -1;
        }

        body.setVelocityX(direction * speed);
      }

      enemy.setData("direction", direction);
      enemy.setFlipX(direction > 0);
      return true;
    });
  }

  private addBackdrop(): void {
    const background = this.add.graphics();
    background.fillGradientStyle(0x180606, 0x180606, 0x45130e, 0x6a2612, 1);
    background.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const volcanoes = this.add.graphics();
    volcanoes.fillStyle(0x2f120e, 1);
    for (let i = 0; i < 11; i += 1) {
      const x = i * 400;
      volcanoes.fillTriangle(x, 520, x + 140, 190, x + 280, 520);
      volcanoes.fillTriangle(x + 120, 520, x + 250, 230, x + 380, 520);
      volcanoes.fillStyle(0xff7a33, 0.28);
      volcanoes.fillTriangle(x + 110, 250, x + 140, 180, x + 170, 250);
      volcanoes.fillStyle(0x2f120e, 1);
    }
    volcanoes.setScrollFactor(0.28);

    const smoke = this.add.graphics();
    smoke.fillStyle(0x3c2925, 0.35);
    for (let i = 0; i < 18; i += 1) {
      smoke.fillEllipse(120 + i * 230, 150 + (i % 3) * 34, 210, 82);
    }
    smoke.setScrollFactor(0.18);

    const glow = this.add.graphics();
    glow.fillStyle(0xff7a2c, 0.16);
    for (let i = 0; i < 14; i += 1) {
      glow.fillEllipse(i * 320, 690, 340, 90);
    }
    glow.setScrollFactor(0.62);
  }

  private addDecorations(): void {
    [
      [400, 410],
      [1320, 300],
      [2440, 244],
      [3600, 250]
    ].forEach(([x, y]) => {
      const ember = this.add.image(x, y, "lava-glow").setDepth(5);
      this.tweens.add({
        targets: ember,
        alpha: 0.42,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    const lavafall = this.add.image(3980, 160, "lavafall").setDepth(6);
    lavafall.setScale(1.18, 1.1);
  }

  private openShop(): void {
    this.scene.launch("ShopScene", {
      returnScene: this.sys.settings.key
    });
    this.scene.pause();
  }

  private getJumpStrength(baseStrength: number): number {
    return baseStrength;
  }

  private handleResume(): void {
    this.refreshLoadout();
    this.updateHud();
  }

  private getAvailableAirJumps(): number {
    return 1 + this.extraAirJumps;
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
    this.extraAirJumps = loadout.extraAirJumps;
  }

  private tuneStaticPlatformBody(
    sprite: Phaser.Physics.Arcade.Sprite,
    width: number,
    height: number
  ): void {
    const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
    const isWall = height > width * 1.5;
    const insetX = isWall ? 3 : 6;
    const insetTop = isWall ? 4 : 6;
    const hitWidth = Math.max(12, width - insetX * 2);
    const hitHeight = Math.max(12, height - insetTop);

    body.setSize(hitWidth, hitHeight);
    body.position.set(sprite.x - hitWidth / 2, sprite.y - height / 2 + insetTop);
  }

  private tuneDynamicPlatformBody(
    sprite: Phaser.Physics.Arcade.Sprite,
    width: number,
    height: number
  ): void {
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const insetX = 6;
    const insetTop = 4;
    body.setSize(Math.max(12, width - insetX * 2), Math.max(10, height - insetTop));
    body.setOffset(insetX, insetTop);
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    graphics.clear();
    graphics.fillStyle(0x5a3327, 1);
    graphics.fillRoundedRect(0, 0, 64, 32, 12);
    graphics.fillStyle(0x291714, 1);
    graphics.fillRect(0, 22, 64, 10);
    graphics.fillStyle(0xff8f3a, 0.9);
    graphics.fillEllipse(18, 8, 20, 10);
    graphics.fillEllipse(44, 12, 18, 8);
    graphics.generateTexture("lava-ground", 64, 32);

    graphics.clear();
    graphics.fillStyle(0x7a4632, 1);
    graphics.fillRoundedRect(0, 0, 64, 24, 10);
    graphics.fillStyle(0xffa545, 1);
    graphics.fillRect(6, 16, 52, 4);
    graphics.fillStyle(0x3b231d, 1);
    graphics.fillRect(10, 10, 44, 4);
    graphics.generateTexture("lava-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0x412722, 1);
    graphics.fillRect(0, 0, 20, 64);
    graphics.fillStyle(0x8b5137, 1);
    graphics.fillRect(4, 0, 4, 64);
    graphics.fillRect(12, 0, 3, 64);
    graphics.generateTexture("lava-wall", 20, 64);

    graphics.clear();
    graphics.fillStyle(0x5d3928, 1);
    graphics.fillEllipse(32, 16, 64, 24);
    graphics.fillStyle(0xffb25a, 0.95);
    graphics.fillEllipse(32, 12, 40, 10);
    graphics.generateTexture("lava-moving-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0xff7d2a, 1);
    graphics.fillEllipse(20, 12, 40, 16);
    graphics.fillStyle(0xffc155, 0.92);
    graphics.fillEllipse(20, 8, 28, 8);
    graphics.generateTexture("lava-surface", 40, 18);

    graphics.clear();
    graphics.fillStyle(0x7e3f1d, 1);
    graphics.fillCircle(22, 18, 18);
    graphics.fillCircle(42, 18, 18);
    graphics.fillStyle(0xffc768, 1);
    graphics.fillCircle(32, 18, 10);
    graphics.fillStyle(0xff8c3f, 1);
    graphics.fillCircle(32, 18, 4);
    graphics.generateTexture("lava-vent", 64, 40);

    graphics.clear();
    graphics.fillStyle(0xffa847, 1);
    graphics.fillRoundedRect(8, 0, 24, 80, 12);
    graphics.fillStyle(0xffd779, 0.85);
    graphics.fillCircle(20, 16, 8);
    graphics.fillCircle(20, 34, 6);
    graphics.fillCircle(20, 52, 7);
    graphics.generateTexture("lava-jet", 40, 80);

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
    graphics.fillStyle(0x8f5c3d, 1);
    graphics.fillRect(10, 0, 12, 48);
    graphics.fillStyle(0xffc25e, 1);
    graphics.fillTriangle(22, 6, 54, 18, 22, 32);
    graphics.generateTexture("lava-checkpoint", 56, 48);

    graphics.clear();
    graphics.fillStyle(0x6f2e1f, 1);
    graphics.fillRoundedRect(8, 14, 40, 28, 12);
    graphics.fillStyle(0xff8a3d, 1);
    graphics.fillRoundedRect(12, 12, 32, 18, 10);
    graphics.fillStyle(0x2b140f, 1);
    graphics.fillCircle(20, 22, 2);
    graphics.fillCircle(36, 22, 2);
    graphics.fillStyle(0xffd56f, 1);
    graphics.fillRect(14, 40, 8, 8);
    graphics.fillRect(34, 40, 8, 8);
    graphics.generateTexture("lava-beast", 56, 48);

    graphics.clear();
    graphics.fillStyle(0xf3cfbf, 1);
    graphics.fillCircle(30, 14, 8);
    graphics.fillStyle(0x4f2b1d, 1);
    graphics.fillEllipse(30, 10, 24, 16);
    graphics.fillRect(18, 12, 6, 20);
    graphics.fillStyle(0xf2c84b, 1);
    graphics.fillTriangle(24, 4, 38, 4, 31, 0);
    graphics.fillStyle(0xd56436, 1);
    graphics.fillRoundedRect(18, 22, 24, 24, 8);
    graphics.fillStyle(0xffd2a2, 1);
    graphics.fillRect(24, 24, 12, 12);
    graphics.fillStyle(0x7c3019, 1);
    graphics.fillRect(18, 45, 8, 16);
    graphics.fillRect(34, 45, 8, 16);
    graphics.fillStyle(0xffb66a, 1);
    graphics.fillTriangle(42, 24, 54, 30, 42, 40);
    graphics.generateTexture("lava-knight", 64, 64);

    graphics.clear();
    graphics.fillStyle(0x7b2a1a, 1);
    graphics.fillRoundedRect(8, 0, 64, 92, 14);
    graphics.fillStyle(0xff9a44, 1);
    graphics.fillCircle(40, 30, 12);
    graphics.lineStyle(4, 0xff9a44, 1);
    graphics.strokeEllipse(40, 50, 34, 24);
    graphics.beginPath();
    graphics.moveTo(24, 66);
    graphics.lineTo(56, 74);
    graphics.strokePath();
    graphics.fillStyle(0xffd76d, 1);
    graphics.fillEllipse(18, -2, 24, 12);
    graphics.fillEllipse(60, -2, 24, 12);
    graphics.generateTexture("lava-gate", 80, 96);

    graphics.clear();
    graphics.fillStyle(0xff9e3c, 0.9);
    graphics.fillCircle(10, 10, 10);
    graphics.fillStyle(0xffdd7f, 1);
    graphics.fillCircle(10, 10, 4);
    graphics.generateTexture("lava-glow", 20, 20);

    graphics.clear();
    graphics.fillStyle(0xff7d2c, 0.94);
    graphics.fillRoundedRect(8, 0, 64, 96, 18);
    graphics.fillStyle(0xffc96a, 0.65);
    graphics.fillRect(20, 4, 10, 88);
    graphics.fillRect(42, 8, 8, 80);
    graphics.fillStyle(0xffffff, 0.15);
    graphics.fillEllipse(40, 84, 56, 16);
    graphics.generateTexture("lavafall", 80, 96);

    graphics.destroy();
  }
}

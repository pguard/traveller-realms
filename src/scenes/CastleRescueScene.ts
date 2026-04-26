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

type SpikeDef = {
  x: number;
  y: number;
  width: number;
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

type FlameTrapDef = {
  x: number;
  y: number;
  interval: number;
  activeDuration: number;
  delay: number;
};

type AxeTrapDef = {
  x: number;
  y: number;
  arcWidth: number;
  drop: number;
  duration: number;
  delay: number;
};

type CrumblePlatformDef = {
  x: number;
  y: number;
  width: number;
};

const WORLD_WIDTH = 5600;
const WORLD_HEIGHT = 720;
const PLAYER_SPEED = 390;
const DASH_SPEED = 800;
const JUMP_VELOCITY = -820;
const WALL_JUMP_X = 470;
const WALL_JUMP_Y = -780;
const PLAYER_TINT = 0x5cb3ff;
const CHECKPOINT_TINT = 0xf9d56e;

export class CastleRescueScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private knight!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private crumblePlatforms!: Phaser.Physics.Arcade.Group;
  private spikes!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private flameTraps!: Phaser.Physics.Arcade.Group;
  private axeTraps!: Phaser.Physics.Arcade.Group;
  private seals!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"A" | "D" | "W" | "R" | "SHIFT", Phaser.Input.Keyboard.Key>;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private shopText!: Phaser.GameObjects.Text;
  private sealCount = 0;
  private deaths = 0;
  private checkpointsHit = 0;
  private respawnPoint = new Phaser.Math.Vector2(140, 560);
  private airJumpsRemaining = 2;
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
    super("CastleRescueScene");
  }

  preload(): void {
    this.createTextures();
  }

  create(): void {
    this.finished = false;
    this.sealCount = 0;
    this.deaths = 0;
    this.checkpointsHit = 0;
    this.respawnPoint.set(140, 560);
    this.airJumpsRemaining = 2;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.damageCooldown = 0;
    this.wallSide = 0;
    this.refreshLoadout(true);
    this.airJumpsRemaining = this.getAvailableAirJumps();

    unlockAudio(this);
    this.events.off("resume");
    this.events.on("resume", this.handleResume, this);

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor("#120b1b");
    this.addBackground();

    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.crumblePlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.spikes = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.flameTraps = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.axeTraps = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.seals = this.physics.add.group({
      allowGravity: false
    });
    this.checkpoints = this.physics.add.staticGroup();

    this.buildLevel();

    this.player = this.physics.add.sprite(this.respawnPoint.x, this.respawnPoint.y, "princess");
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(2200);
    this.player.setMaxVelocity(PLAYER_SPEED, 1260);
    this.player.setSize(24, 48);
    this.player.setOffset(12, 12);

    this.knight = this.physics.add.sprite(5430, 132, "knight");
    (this.knight.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.knight.setImmovable(true);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingPlatforms);
    this.physics.add.collider(
      this.player,
      this.crumblePlatforms,
      (_obj1, obj2) => this.touchCrumblePlatform(obj2),
      undefined,
      this
    );
    this.physics.add.collider(this.knight, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.enemies, this.movingPlatforms);
    this.physics.add.overlap(
      this.player,
      this.spikes,
      () => this.tryDamage("The spikes found their mark."),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.flameTraps,
      (_obj1, obj2) => this.touchFlameTrap(obj2),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.axeTraps,
      () => this.tryDamage("A swinging blade cut the run short."),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      (_obj1, obj2) => this.handleEnemyContact(obj2),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.seals,
      (_obj1, obj2) => this.collectSeal(obj2),
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.checkpoints,
      (_obj1, obj2) => this.activateCheckpoint(obj2),
      undefined,
      this
    );
    this.physics.add.overlap(this.player, this.knight, this.finishLevel, undefined, this);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.wasd = this.input.keyboard?.addKeys("A,D,W,R,SHIFT") as Record<
      "A" | "D" | "W" | "R" | "SHIFT",
      Phaser.Input.Keyboard.Key
    >;
    this.jumpKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;
    this.dashKey = this.wasd.SHIFT;
    this.restartKey = this.wasd.R;

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09, -120, 40);

    this.hudText = this.add
      .text(28, 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#fff7d6",
        stroke: "#2f1737",
        strokeThickness: 5
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.messageText = this.add
      .text(640, 86, "Reach the knight in the tower.", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#ffe7a8",
        align: "center",
        stroke: "#2f1737",
        strokeThickness: 6
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(20);

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
      .setDepth(21)
      .setInteractive({ useHandCursor: true });

    this.shopText.on("pointerdown", () => {
      playSound(this, "select");
      this.openShop();
    });

    this.time.delayedCall(4200, () => {
      if (!this.finished) {
        this.messageText.setText("You have an extra air jump. Rescue the knight to choose the next realm.");
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

    this.updateMovingPlatforms();
    this.updateCrumblePlatforms();
    this.updateFlameTraps(delta);
    this.updateAxeTraps(delta);
    this.updateEnemies();

    if (this.damageCooldown > 0) {
      this.damageCooldown = Math.max(0, this.damageCooldown - dt);
      this.player.setAlpha(
        this.damageCooldown > 0 && Math.floor(this.damageCooldown * 22) % 2 === 0 ? 0.45 : 1
      );
    } else {
      this.player.setAlpha(1);
    }

    if (this.finished) {
      this.player.setVelocityX(0);
      return;
    }

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down || body.touching.down;
    const jumpHeld = this.jumpKey.isDown || this.cursors.up.isDown || this.wasd.W.isDown;

    if (onGround) {
      this.coyoteTimer = 0.18;
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
      this.player.setVelocityY(-18);
      this.player.setVelocityX(this.dashDirection * DASH_SPEED);

      if (this.dashTimer <= 0) {
        this.player.clearTint();
      }
      this.updateHud();
      return;
    }

    const moveLeft = this.cursors.left.isDown || this.wasd.A.isDown;
    const moveRight = this.cursors.right.isDown || this.wasd.D.isDown;
    const wantsJump =
      Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.W);
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
        this.performJump(JUMP_VELOCITY * 0.94);
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
    } else {
      this.player.setAccelerationX((moveLeft ? -1 : 1) * 1850);
      this.dashDirection = moveLeft ? -1 : 1;
      this.player.setFlipX(moveLeft);
    }

    if (!Phaser.Input.Keyboard.JustUp(this.jumpKey) && !Phaser.Input.Keyboard.JustUp(this.cursors.up)) {
      if (!jumpHeld && body.velocity.y < -260) {
        this.player.setVelocityY(body.velocity.y * 0.58);
      }
    }

    if (this.player.y > WORLD_HEIGHT + 40) {
      this.tryDamage("A missed leap sent you into the moat.");
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
    this.dashTimer = 0.16;
    this.dashCooldown = 0.65;
    this.player.setVelocity(this.dashDirection * DASH_SPEED, -18);
    this.player.setAccelerationX(0);
    this.player.setTint(PLAYER_TINT);
    playSound(this, "dash");
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

    this.respawnPlayer(reason);
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

    this.tryDamage("A monster got too close.");
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active) {
      return;
    }

    enemy.disableBody(true, true);
    this.player.setVelocityY(-560);
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.showMessage(this.swordEquipped ? "Sword strike!" : "Monster defeated.");
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
    this.updateHud();
    playSound(this, "seal");
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
    this.showMessage("Checkpoint claimed.");
    this.updateHud();
    playSound(this, "checkpoint");
  }

  private touchFlameTrap(
    trapObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const trap = trapObject as Phaser.Physics.Arcade.Sprite;
    if (trap.getData("active")) {
      this.tryDamage("A burst of fire scorched your armor.");
    }
  }

  private touchCrumblePlatform(
    platformObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const platform = platformObject as Phaser.Physics.Arcade.Sprite;
    const state = platform.getData("state") as string;

    if (state !== "idle") {
      return;
    }

    platform.setData("state", "warning");
    platform.setTint(0xd08a4a);

    this.time.delayedCall(760, () => {
      if (!platform.active || platform.getData("state") !== "warning") {
        return;
      }

      platform.setData("state", "gone");
      platform.disableBody(true, true);

      this.time.delayedCall(1500, () => {
        const x = platform.getData("originX") as number;
        const y = platform.getData("originY") as number;
        platform.enableBody(false, x, y, true, true);
        platform.setTint(0xffffff);
        platform.setData("state", "idle");
        (platform.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        (platform.body as Phaser.Physics.Arcade.Body).setImmovable(true);
      });
    });
  }

  private respawnPlayer(reason: string): void {
    if (this.finished) {
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
    this.dashCooldown = 0.28;
    this.damageCooldown = 1;
    this.showMessage(reason);
    this.cameras.main.shake(180, 0.006);
    this.updateHud();
    playSound(this, "hurt");
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
    this.player.setPosition(this.knight.x - 34, this.knight.y + 14);
    this.player.setFlipX(false);

    this.tweens.add({
      targets: [this.player, this.knight],
      y: "-=8",
      duration: 450,
      yoyo: true,
      repeat: 1,
      ease: "Sine.inOut"
    });

    this.showMessage("The princess saved the knight. Two new paths appear ahead.", true);
    this.cameras.main.flash(700, 255, 241, 191);
    playSound(this, "rescue");

    this.time.delayedCall(1800, () => {
      this.scene.start("RealmChoiceScene", {
        seals: this.sealCount,
        deaths: this.deaths
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
      `Level seals ${this.sealCount}/5   Wallet ${getSealBalance()}   Deaths ${this.deaths}   Armor ${armorState}   Gear ${gear}   Dash ${dashState}`
    );
    this.shopText.setText(`Seal Shop ${getSealBalance()}`);
  }

  private addBackground(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x120b1b, 0x120b1b, 0x3f214f, 0x6d4d69, 1);
    sky.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let i = 0; i < 7; i += 1) {
      const x = 160 + i * 820;
      const moonGlow = this.add.ellipse(x, 120 + (i % 2) * 20, 180, 90, 0xffdfb3, 0.08);
      moonGlow.setScrollFactor(0.15);
    }

    const farTowers = this.add.graphics();
    farTowers.fillStyle(0x26152d, 1);
    for (let i = 0; i < 14; i += 1) {
      const x = i * 420;
      const towerHeight = 240 + (i % 3) * 60;
      farTowers.fillRect(x, WORLD_HEIGHT - towerHeight - 140, 190, towerHeight);
      farTowers.fillTriangle(
        x + 20,
        WORLD_HEIGHT - towerHeight - 140,
        x + 95,
        WORLD_HEIGHT - towerHeight - 220,
        x + 170,
        WORLD_HEIGHT - towerHeight - 140
      );
    }
    farTowers.setScrollFactor(0.22);

    const midWalls = this.add.graphics();
    midWalls.fillStyle(0x4f2d3f, 1);
    for (let i = 0; i < 16; i += 1) {
      const x = i * 360;
      const wallHeight = 180 + (i % 4) * 36;
      midWalls.fillRect(x, WORLD_HEIGHT - wallHeight - 70, 250, wallHeight);
      for (let w = 0; w < 4; w += 1) {
        midWalls.fillRect(x + 12 + w * 58, WORLD_HEIGHT - wallHeight - 84, 34, 14);
      }
    }
    midWalls.setScrollFactor(0.46);

    const mist = this.add.graphics();
    mist.fillStyle(0xf3d6a4, 0.08);
    for (let i = 0; i < 20; i += 1) {
      mist.fillEllipse(i * 320, WORLD_HEIGHT - 60 - (i % 3) * 14, 300, 80);
    }
    mist.setScrollFactor(0.65);
  }

  private buildLevel(): void {
    const groundSegments: PlatformDef[] = [
      { x: 190, y: 680, width: 320 },
      { x: 680, y: 680, width: 260 },
      { x: 1260, y: 680, width: 250 },
      { x: 1860, y: 680, width: 280 },
      { x: 2480, y: 680, width: 270 },
      { x: 3110, y: 680, width: 260 },
      { x: 3740, y: 680, width: 280 },
      { x: 4370, y: 680, width: 260 },
      { x: 5000, y: 680, width: 280 },
      { x: 5480, y: 680, width: 210 }
    ];

    const upperPlatforms: PlatformDef[] = [
      { x: 490, y: 582, width: 150 },
      { x: 770, y: 520, width: 136 },
      { x: 1050, y: 446, width: 126 },
      { x: 1320, y: 380, width: 122 },
      { x: 1600, y: 322, width: 130 },
      { x: 1890, y: 388, width: 150 },
      { x: 2160, y: 318, width: 122 },
      { x: 2440, y: 262, width: 130 },
      { x: 2735, y: 336, width: 150 },
      { x: 3025, y: 422, width: 130 },
      { x: 3330, y: 512, width: 120 },
      { x: 3620, y: 432, width: 122 },
      { x: 3910, y: 350, width: 120 },
      { x: 4210, y: 280, width: 126 },
      { x: 4520, y: 216, width: 130 },
      { x: 4805, y: 282, width: 136 },
      { x: 5100, y: 212, width: 126 },
      { x: 5420, y: 164, width: 190 }
    ];

    [...groundSegments, ...upperPlatforms].forEach((platform) => {
      const sprite = this.platforms.create(platform.x, platform.y, "platform");
      const height = platform.height ?? 28;
      sprite.setDisplaySize(platform.width, height).refreshBody().setDepth(5);
      this.tuneStaticPlatformBody(sprite, platform.width, height);
    });

    const walls: PlatformDef[] = [
      { x: 900, y: 590, width: 28, height: 190 },
      { x: 1730, y: 560, width: 28, height: 260 },
      { x: 2860, y: 548, width: 28, height: 220 },
      { x: 4330, y: 530, width: 28, height: 230 },
      { x: 5200, y: 478, width: 28, height: 360 }
    ];

    walls.forEach((wall) => {
      const sprite = this.platforms.create(wall.x, wall.y, "wall");
      const height = wall.height ?? 28;
      sprite.setDisplaySize(wall.width, height).refreshBody().setDepth(5);
      this.tuneStaticPlatformBody(sprite, wall.width, height);
    });

    const spikes: SpikeDef[] = [
      { x: 410, y: 662, width: 80 },
      { x: 1080, y: 662, width: 80 },
      { x: 2280, y: 662, width: 80 },
      { x: 3500, y: 662, width: 80 },
      { x: 4680, y: 662, width: 80 },
      { x: 5140, y: 194, width: 40 }
    ];

    spikes.forEach((spike) => {
      const count = Math.floor(spike.width / 20);
      for (let i = 0; i < count; i += 1) {
        const piece = this.spikes.create(spike.x + i * 20, spike.y, "spike");
        piece.setOrigin(0, 1).refreshBody().setDepth(6);
      }
    });

    const crumblePlatforms: CrumblePlatformDef[] = [
      { x: 1650, y: 270, width: 110 },
      { x: 4380, y: 180, width: 110 }
    ];

    crumblePlatforms.forEach((platform) => {
      const sprite = this.crumblePlatforms.create(
        platform.x,
        platform.y,
        "crumble-platform"
      ) as Phaser.Physics.Arcade.Sprite;
      sprite.setDisplaySize(platform.width, 24);
      sprite.setData("originX", platform.x);
      sprite.setData("originY", platform.y);
      sprite.setData("state", "idle");
      this.tuneDynamicPlatformBody(sprite, platform.width, 24);
      sprite.setDepth(6);
    });

    const seals = [
      [770, 460],
      [1600, 268],
      [2440, 214],
      [3910, 298],
      [5100, 166]
    ];

    seals.forEach(([x, y]) => {
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

    const checkpoints = [
      [1910, 626],
      [4540, 182]
    ];

    checkpoints.forEach(([x, y]) => {
      const checkpoint = this.checkpoints.create(x, y, "checkpoint");
      checkpoint.setData("active", false);
      checkpoint.setDepth(7);
    });

    const movingPlatforms: MovingPlatformDef[] = [
      { x: 2080, y: 474, width: 132, deltaX: 0, deltaY: -120, duration: 2400 },
      { x: 3230, y: 368, width: 138, deltaX: 150, deltaY: 0, duration: 2500 },
      { x: 4300, y: 318, width: 128, deltaX: 180, deltaY: 0, duration: 2300 },
      { x: 4840, y: 408, width: 132, deltaX: 0, deltaY: 130, duration: 2600 }
    ];

    movingPlatforms.forEach((platform) => {
      const sprite = this.movingPlatforms.create(
        platform.x,
        platform.y,
        "moving-platform"
      ) as Phaser.Physics.Arcade.Sprite;
      sprite.setDisplaySize(platform.width, 24);
      this.tuneDynamicPlatformBody(sprite, platform.width, 24);
      sprite.setImmovable(true);
      sprite.setData("originX", platform.x);
      sprite.setData("originY", platform.y);
      sprite.setData("deltaX", platform.deltaX);
      sprite.setData("deltaY", platform.deltaY);
      sprite.setData("duration", platform.duration);
      sprite.setData("elapsed", Phaser.Math.Between(0, platform.duration));
      sprite.setDepth(6);
    });

    const enemies: EnemyDef[] = [
      { x: 700, y: 630, patrolLeft: 610, patrolRight: 760, speed: 60, aggroRange: 180 },
      { x: 2750, y: 286, patrolLeft: 2680, patrolRight: 2810, speed: 66, aggroRange: 170 },
      { x: 5100, y: 162, patrolLeft: 5050, patrolRight: 5150, speed: 70, aggroRange: 180 }
    ];

    enemies.forEach((enemyDef) => {
      const enemy = this.enemies.create(enemyDef.x, enemyDef.y, "monster") as Phaser.Physics.Arcade.Sprite;
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
      enemy.setDepth(8);
    });

    const flameTraps: FlameTrapDef[] = [
      { x: 1190, y: 650, interval: 2600, activeDuration: 780, delay: 0 },
      { x: 3330, y: 650, interval: 2700, activeDuration: 820, delay: 550 },
      { x: 5290, y: 144, interval: 2500, activeDuration: 780, delay: 950 }
    ];

    flameTraps.forEach((trapDef) => {
      const trap = this.flameTraps.create(trapDef.x, trapDef.y, "flame-trap") as Phaser.Physics.Arcade.Sprite;
      trap.setDepth(7);
      trap.setOrigin(0.5, 1);
      trap.setData("interval", trapDef.interval);
      trap.setData("activeDuration", trapDef.activeDuration);
      trap.setData("elapsed", trapDef.delay);
      trap.setData("active", false);
      (trap.body as Phaser.Physics.Arcade.Body).setSize(26, 58);
    });

    const axeTraps: AxeTrapDef[] = [
      { x: 1460, y: 236, arcWidth: 58, drop: 74, duration: 1900, delay: 0 },
      { x: 4750, y: 154, arcWidth: 64, drop: 84, duration: 1900, delay: 620 }
    ];

    axeTraps.forEach((trapDef) => {
      const trap = this.axeTraps.create(
        trapDef.x,
        trapDef.y + trapDef.drop,
        "axe-blade"
      ) as Phaser.Physics.Arcade.Sprite;
      trap.setDepth(8);
      trap.setData("originX", trapDef.x);
      trap.setData("originY", trapDef.y);
      trap.setData("arcWidth", trapDef.arcWidth);
      trap.setData("drop", trapDef.drop);
      trap.setData("duration", trapDef.duration);
      trap.setData("elapsed", trapDef.delay);
      (trap.body as Phaser.Physics.Arcade.Body).setSize(30, 30);
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

  private updateCrumblePlatforms(): void {
    this.crumblePlatforms.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const platform = child as Phaser.Physics.Arcade.Sprite | null;
      if (!platform || !platform.body) {
        return true;
      }

      (platform.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return true;
    });
  }

  private updateFlameTraps(delta: number): void {
    this.flameTraps.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const trap = child as Phaser.Physics.Arcade.Sprite | null;
      if (!trap || !trap.body) {
        return true;
      }

      const interval = trap.getData("interval") as number;
      const activeDuration = trap.getData("activeDuration") as number;
      const elapsed = ((trap.getData("elapsed") as number) + delta) % interval;
      const active = elapsed < activeDuration;
      const body = trap.body as Phaser.Physics.Arcade.Body;

      trap.setData("elapsed", elapsed);
      trap.setData("active", active);
      trap.setScale(1, active ? 1 : 0.35);
      trap.setAlpha(active ? 1 : 0.42);
      body.setEnable(active);
      body.setOffset(1, active ? 0 : 38);
      body.setSize(26, active ? 58 : 18);
      return true;
    });
  }

  private updateAxeTraps(delta: number): void {
    this.axeTraps.children.iterate((child: Phaser.GameObjects.GameObject) => {
      const trap = child as Phaser.Physics.Arcade.Sprite | null;
      if (!trap || !trap.body) {
        return true;
      }

      const duration = trap.getData("duration") as number;
      const elapsed = ((trap.getData("elapsed") as number) + delta) % duration;
      const progress = elapsed / duration;
      const angle = Math.sin(progress * Math.PI * 2) * 0.9;
      const originX = trap.getData("originX") as number;
      const originY = trap.getData("originY") as number;
      const arcWidth = trap.getData("arcWidth") as number;
      const drop = trap.getData("drop") as number;
      const nextX = originX + Math.sin(angle) * arcWidth;
      const nextY = originY + Math.cos(angle) * drop;

      trap.setData("elapsed", elapsed);
      trap.setPosition(nextX, nextY);
      trap.setRotation(angle + Math.PI * 0.5);
      (trap.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
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

      if (Math.abs(dx) <= aggroRange && dy < 72) {
        direction = dx < 0 ? -1 : 1;
        body.setVelocityX(direction * (speed + 22));
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

  private addDecorations(): void {
    const banners = [
      [760, 532],
      [1940, 382],
      [3040, 386],
      [4800, 270]
    ];

    banners.forEach(([x, y], index) => {
      this.add.image(x, y, index % 2 === 0 ? "banner-red" : "banner-gold").setDepth(4);
    });

    const torches = [
      [340, 620],
      [1400, 334],
      [2480, 274],
      [3940, 304],
      [5340, 140]
    ];

    torches.forEach(([x, y]) => {
      const torch = this.add.image(x, y, "torch").setDepth(4);
      this.tweens.add({
        targets: torch,
        scaleY: 1.08,
        scaleX: 0.96,
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    [
      [1460, 230],
      [4750, 148]
    ].forEach(([x, y]) => {
      this.add.image(x, y, "chain-anchor").setDepth(5);
    });

    const gate = this.add.image(5490, 632, "gate");
    gate.setDisplaySize(160, 120).setDepth(4);
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
    return 2 + this.extraAirJumps;
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
    graphics.fillStyle(0x8aa0b3, 1);
    graphics.fillRoundedRect(0, 0, 64, 32, 6);
    graphics.fillStyle(0x5e6d7b, 1);
    for (let i = 0; i < 5; i += 1) {
      graphics.fillRect(i * 13, 0, 10, 8);
    }
    graphics.fillStyle(0xb7c6d0, 1);
    graphics.fillRect(0, 24, 64, 8);
    graphics.generateTexture("platform", 64, 32);

    graphics.clear();
    graphics.fillStyle(0x7d8f9f, 1);
    graphics.fillRect(0, 0, 32, 64);
    graphics.fillStyle(0xa4b5c5, 1);
    for (let i = 0; i < 5; i += 1) {
      graphics.fillRect(0, i * 12, 32, 3);
    }
    graphics.generateTexture("wall", 32, 64);

    graphics.clear();
    graphics.fillStyle(0xa2724a, 1);
    graphics.fillRoundedRect(0, 0, 64, 24, 8);
    graphics.fillStyle(0xc49762, 1);
    graphics.fillRect(6, 5, 52, 5);
    graphics.generateTexture("moving-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0x9b6a3c, 1);
    graphics.fillRoundedRect(0, 0, 64, 24, 8);
    graphics.fillStyle(0xe7b26c, 1);
    for (let i = 0; i < 4; i += 1) {
      graphics.fillRect(8 + i * 14, 6, 8, 4);
    }
    graphics.fillStyle(0x4f2a16, 1);
    graphics.fillRect(10, 15, 44, 3);
    graphics.generateTexture("crumble-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0xf8f4e3, 1);
    graphics.fillTriangle(0, 24, 10, 0, 20, 24);
    graphics.generateTexture("spike", 20, 24);

    graphics.clear();
    graphics.fillStyle(0xf2d4b1, 1);
    graphics.fillCircle(30, 14, 8);
    graphics.fillStyle(0x5d3f2b, 1);
    graphics.fillEllipse(30, 10, 24, 16);
    graphics.fillRect(18, 12, 6, 22);
    graphics.fillStyle(0xf2c84b, 1);
    graphics.fillTriangle(24, 4, 38, 4, 31, 0);
    graphics.fillStyle(0xd1d8e3, 1);
    graphics.fillRoundedRect(14, 22, 32, 34, 10);
    graphics.fillStyle(0x4877ad, 1);
    graphics.fillRect(20, 30, 20, 18);
    graphics.fillStyle(0x244e7a, 1);
    graphics.fillRect(18, 48, 8, 12);
    graphics.fillRect(34, 48, 8, 12);
    graphics.fillStyle(0x9aa8b5, 1);
    graphics.fillRect(46, 30, 8, 24);
    graphics.generateTexture("knight", 64, 64);

    graphics.clear();
    graphics.fillStyle(0x4e9254, 1);
    graphics.fillRoundedRect(8, 14, 40, 30, 12);
    graphics.fillStyle(0x7ccc6f, 1);
    graphics.fillRoundedRect(12, 12, 32, 20, 10);
    graphics.fillStyle(0xdde9c8, 1);
    graphics.fillCircle(20, 22, 4);
    graphics.fillCircle(36, 22, 4);
    graphics.fillStyle(0x1b2417, 1);
    graphics.fillCircle(20, 22, 2);
    graphics.fillCircle(36, 22, 2);
    graphics.fillStyle(0x8e4b49, 1);
    graphics.fillTriangle(24, 30, 32, 30, 28, 36);
    graphics.fillStyle(0x5b3c2f, 1);
    graphics.fillRect(14, 40, 8, 8);
    graphics.fillRect(34, 40, 8, 8);
    graphics.generateTexture("monster", 56, 48);

    graphics.clear();
    graphics.fillStyle(0xf8d9d4, 1);
    graphics.fillCircle(24, 14, 8);
    graphics.fillStyle(0x5c3828, 1);
    graphics.fillEllipse(24, 10, 24, 16);
    graphics.fillRect(12, 12, 6, 22);
    graphics.fillStyle(0xf1cf69, 1);
    graphics.fillTriangle(16, 4, 32, 4, 24, 0);
    graphics.fillStyle(0xed9eb5, 1);
    graphics.fillRoundedRect(10, 22, 28, 34, 8);
    graphics.fillStyle(0xf8edf5, 1);
    graphics.fillRect(16, 28, 12, 12);
    graphics.fillStyle(0xd77ead, 1);
    graphics.fillTriangle(10, 56, 24, 42, 38, 56);
    graphics.fillStyle(0xf7efe3, 1);
    graphics.fillRect(14, 56, 8, 8);
    graphics.fillRect(26, 56, 8, 8);
    graphics.generateTexture("princess", 48, 64);

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
    graphics.fillStyle(0x586a70, 1);
    graphics.fillRect(10, 0, 12, 48);
    graphics.fillStyle(0x8c3b3b, 1);
    graphics.fillTriangle(22, 6, 52, 18, 22, 32);
    graphics.generateTexture("checkpoint", 54, 48);

    graphics.clear();
    graphics.fillStyle(0xff9c36, 1);
    graphics.fillTriangle(14, 0, 28, 32, 0, 32);
    graphics.fillStyle(0xffe27a, 0.75);
    graphics.fillTriangle(14, 8, 22, 28, 6, 28);
    graphics.fillStyle(0x59311d, 1);
    graphics.fillRect(10, 32, 8, 24);
    graphics.generateTexture("flame-trap", 28, 56);

    graphics.clear();
    graphics.fillStyle(0xbfc6cc, 1);
    graphics.fillCircle(24, 24, 18);
    graphics.fillStyle(0x667078, 1);
    graphics.fillCircle(24, 24, 7);
    graphics.fillRect(21, 4, 6, 40);
    graphics.fillRect(4, 21, 40, 6);
    graphics.generateTexture("axe-blade", 48, 48);

    graphics.clear();
    graphics.fillStyle(0x7a808a, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.fillStyle(0x4d5158, 1);
    graphics.fillCircle(8, 8, 3);
    graphics.generateTexture("chain-anchor", 16, 16);

    graphics.clear();
    graphics.fillStyle(0x7d1c25, 1);
    graphics.fillRect(0, 0, 32, 70);
    graphics.fillStyle(0xe7c15f, 1);
    graphics.fillRect(3, 0, 26, 10);
    graphics.generateTexture("banner-red", 32, 70);

    graphics.clear();
    graphics.fillStyle(0xc9a448, 1);
    graphics.fillRect(0, 0, 32, 70);
    graphics.fillStyle(0x5b2940, 1);
    graphics.fillRect(3, 0, 26, 10);
    graphics.generateTexture("banner-gold", 32, 70);

    graphics.clear();
    graphics.fillStyle(0x53301c, 1);
    graphics.fillRect(10, 18, 8, 22);
    graphics.fillStyle(0xffcc63, 1);
    graphics.fillCircle(14, 14, 10);
    graphics.fillStyle(0xffefad, 0.75);
    graphics.fillCircle(14, 14, 6);
    graphics.generateTexture("torch", 28, 40);

    graphics.clear();
    graphics.fillStyle(0x8b7aa0, 0.95);
    graphics.fillRoundedRect(0, 0, 60, 84, 8);
    graphics.fillStyle(0xffefb1, 1);
    graphics.fillRoundedRect(14, 18, 32, 44, 10);
    graphics.generateTexture("window", 60, 84);

    graphics.clear();
    graphics.fillStyle(0x41282d, 1);
    graphics.fillRoundedRect(0, 0, 80, 60, 12);
    graphics.fillStyle(0x75533c, 1);
    for (let i = 0; i < 5; i += 1) {
      graphics.fillRect(8 + i * 14, 6, 8, 48);
    }
    graphics.generateTexture("gate", 80, 60);

    graphics.destroy();
  }
}

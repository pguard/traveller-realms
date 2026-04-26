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

type ThornDef = {
  x: number;
  y: number;
  width: number;
};

type JungleKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  W: Phaser.Input.Keyboard.Key;
  R: Phaser.Input.Keyboard.Key;
  SHIFT: Phaser.Input.Keyboard.Key;
  ENTER: Phaser.Input.Keyboard.Key;
};

const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 720;
const PLAYER_SPEED = 390;
const JUMP_VELOCITY = -800;
const WALL_JUMP_X = 460;
const WALL_JUMP_Y = -760;
const DASH_SPEED = 780;
const CHECKPOINT_TINT = 0xffd76b;

export class JungleRealmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private bouncePads!: Phaser.Physics.Arcade.StaticGroup;
  private thorns!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private fruits!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: JungleKeys;
  private jumpKey!: Phaser.Input.Keyboard.Key;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private hudText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private shopText!: Phaser.GameObjects.Text;
  private respawnPoint = new Phaser.Math.Vector2(140, 560);
  private fruitCount = 0;
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
    super("JungleRealmScene");
  }

  preload(): void {
    this.createTextures();
  }

  create(): void {
    unlockAudio(this);
    this.finished = false;
    this.respawnPoint.set(140, 560);
    this.fruitCount = 0;
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
    this.cameras.main.setBackgroundColor("#e5f1d5");

    this.addBackdrop();
    this.events.off("resume");
    this.events.on("resume", this.handleResume, this);

    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.bouncePads = this.physics.add.staticGroup();
    this.thorns = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.fruits = this.physics.add.group({
      allowGravity: false
    });
    this.checkpoints = this.physics.add.staticGroup();

    this.buildLevel();

    this.player = this.physics.add.sprite(this.respawnPoint.x, this.respawnPoint.y, "jungle-knight");
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(2100);
    this.player.setMaxVelocity(PLAYER_SPEED, 1260);
    this.player.setSize(28, 48);
    this.player.setOffset(18, 12);

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
    this.physics.add.overlap(this.player, this.thorns, () => this.tryDamage("The thorns were sharper than they looked."), undefined, this);
    this.physics.add.overlap(this.player, this.enemies, (_obj1, obj2) => this.handleEnemyContact(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.fruits, (_obj1, obj2) => this.collectFruit(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.checkpoints, (_obj1, obj2) => this.activateCheckpoint(obj2), undefined, this);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keys = this.input.keyboard?.addKeys("A,D,W,R,SHIFT,ENTER") as JungleKeys;
    this.jumpKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;
    this.dashKey = this.keys.SHIFT;
    this.restartKey = this.keys.R;

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -120, 40);

    this.hudText = this.add
      .text(28, 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#fff8d9",
        stroke: "#32542f",
        strokeThickness: 5
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.messageText = this.add
      .text(640, 86, "Follow the jungle path to the cliff above the river.", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#f8f0d5",
        align: "center",
        stroke: "#32542f",
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

    this.time.delayedCall(4000, () => {
      if (!this.finished) {
        this.messageText.setText("Look for baby seals, leaf lifts, and bounce blossoms.");
      }
    });

    this.time.delayedCall(8200, () => {
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
    } else {
      this.player.setAccelerationX((moveLeft ? -1 : 1) * 1800);
      this.dashDirection = moveLeft ? -1 : 1;
      this.player.setFlipX(moveLeft);
    }

    if (!jumpHeld && body.velocity.y < -260) {
      this.player.setVelocityY(body.velocity.y * 0.58);
    }

    if (this.player.x > 3940 && this.player.y > 610) {
      this.finishLevel();
      return;
    }

    if (this.player.y > WORLD_HEIGHT + 40) {
      this.tryDamage("You slipped off the jungle trail.");
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
    this.player.setTint(0x8fd9ff);
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

    this.tryDamage("A jungle beast pounced when you got too close.");
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active) {
      return;
    }

    enemy.disableBody(true, true);
    this.player.setVelocityY(-540);
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.showMessage(this.swordEquipped ? "Sword strike!" : "Jungle beast defeated.");
    playSound(this, "select");
  }

  private collectFruit(
    fruitObject:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile
  ): void {
    const fruit = fruitObject as Phaser.Physics.Arcade.Image;
    fruit.disableBody(true, true);
    this.fruitCount += 1;
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
    this.showMessage("Trail marker reached.");
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
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.checkCollision.none = true;
    this.player.setVelocity(120, 760);
    this.player.setAccelerationX(0);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.player.setFlipX(false);
    this.shopText.setVisible(false);

    const splash = this.add
      .image(4054, 684, "jungle-splash")
      .setAlpha(0)
      .setScale(0.5, 0.42)
      .setDepth(116);

    const blackout = this.add
      .rectangle(640, 360, 1280, 720, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(120);

    this.messageText.setText("");
    this.messageText.setDepth(121);
    this.messageText.setVisible(false);
    this.hudText.setVisible(false);
    this.updateHud();

    this.time.delayedCall(360, () => {
      splash.setAlpha(0.96);
      this.tweens.add({
        targets: splash,
        alpha: 0,
        scaleX: 1.55,
        scaleY: 1.08,
        duration: 900,
        ease: "Sine.Out"
      });
      this.player.setAlpha(0);
      this.cameras.main.shake(320, 0.008);
      playSound(this, "splash");
    });

    this.time.delayedCall(940, () => {
      this.physics.world.pause();
      this.tweens.add({
        targets: blackout,
        alpha: 1,
        duration: 420,
        ease: "Sine.Out",
        onComplete: () => {
          this.cameras.main.setBackgroundColor("#000000");
          this.children.list.forEach((child) => {
            if (child !== blackout && child !== this.messageText) {
              const hideable = child as Phaser.GameObjects.GameObject & {
                setVisible?: (value: boolean) => unknown;
                visible?: boolean;
              };

              if (hideable.setVisible) {
                hideable.setVisible(false);
              } else if ("visible" in hideable) {
                hideable.visible = false;
              }
            }
          });
          blackout.setVisible(true).setAlpha(1);
          this.messageText.setVisible(true);
          this.messageText.setText("congratulations, you have completed the Jungle realm");
          playSound(this, "rescue");

          this.time.delayedCall(2900, () => {
            this.messageText.setText("");
          });

          this.time.delayedCall(5100, () => {
            this.messageText.setText(
              "you have saved the knight, survived the jungle, but now you must face the underwater world"
            );
          });

          this.time.delayedCall(8400, () => {
            this.scene.start("UnderwaterRealmScene");
          });
        }
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
      `Level seals ${this.fruitCount}/4   Wallet ${getSealBalance()}   Falls ${this.deaths}   Armor ${armorState}   Gear ${gear}   Dash ${dashState}`
    );
    this.shopText.setText(`Seal Shop ${getSealBalance()}`);
  }

  private buildLevel(): void {
    const groundSegments: PlatformDef[] = [
      { x: 200, y: 680, width: 340, texture: "jungle-ground" },
      { x: 760, y: 680, width: 280, texture: "jungle-ground" },
      { x: 1360, y: 680, width: 250, texture: "jungle-ground" },
      { x: 1980, y: 680, width: 300, texture: "jungle-ground" },
      { x: 2620, y: 680, width: 280, texture: "jungle-ground" },
      { x: 3300, y: 680, width: 320, texture: "jungle-ground" },
      { x: 3820, y: 680, width: 120, texture: "jungle-ground" }
    ];

    const upperPlatforms: PlatformDef[] = [
      { x: 520, y: 560, width: 150, texture: "jungle-branch" },
      { x: 820, y: 500, width: 120, texture: "jungle-branch" },
      { x: 1080, y: 434, width: 120, texture: "jungle-branch" },
      { x: 1325, y: 376, width: 120, texture: "jungle-branch" },
      { x: 1610, y: 318, width: 130, texture: "jungle-branch" },
      { x: 1930, y: 392, width: 150, texture: "jungle-branch" },
      { x: 2240, y: 332, width: 120, texture: "jungle-branch" },
      { x: 2550, y: 268, width: 130, texture: "jungle-branch" },
      { x: 2840, y: 348, width: 150, texture: "jungle-branch" },
      { x: 3160, y: 430, width: 130, texture: "jungle-branch" },
      { x: 3460, y: 364, width: 130, texture: "jungle-branch" },
      { x: 3750, y: 288, width: 120, texture: "jungle-branch" },
      { x: 3890, y: 236, width: 120, texture: "jungle-branch" }
    ];

    [...groundSegments, ...upperPlatforms].forEach((platform) => {
      const sprite = this.platforms.create(platform.x, platform.y, platform.texture ?? "jungle-ground");
      const height = platform.height ?? 28;
      sprite.setDisplaySize(platform.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, platform.width, height);
    });

    const vineWalls: PlatformDef[] = [
      { x: 920, y: 590, width: 28, height: 190, texture: "jungle-vine-wall" },
      { x: 1740, y: 552, width: 28, height: 250, texture: "jungle-vine-wall" },
      { x: 2890, y: 540, width: 28, height: 220, texture: "jungle-vine-wall" }
    ];

    vineWalls.forEach((wall) => {
      const sprite = this.platforms.create(wall.x, wall.y, wall.texture ?? "jungle-vine-wall");
      const height = wall.height ?? 28;
      sprite.setDisplaySize(wall.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, wall.width, height);
    });

    const thornPatches: ThornDef[] = [
      { x: 470, y: 662, width: 80 },
      { x: 1190, y: 662, width: 80 },
      { x: 2080, y: 662, width: 80 },
      { x: 3020, y: 662, width: 80 },
      { x: 3640, y: 662, width: 80 }
    ];

    thornPatches.forEach((thorn) => {
      const count = Math.floor(thorn.width / 20);
      for (let i = 0; i < count; i += 1) {
        const piece = this.thorns.create(thorn.x + i * 20, thorn.y, "jungle-thorn");
        piece.setOrigin(0, 1).refreshBody().setDepth(8);
      }
    });

    const bouncePads = [
      [1500, 650],
      [2400, 650],
      [3560, 650]
    ];

    bouncePads.forEach(([x, y]) => {
      const pad = this.bouncePads.create(x, y, "jungle-bloom");
      pad.setDepth(8);
    });

    const movingPlatforms: MovingPlatformDef[] = [
      { x: 2050, y: 500, width: 120, deltaX: 0, deltaY: -140, duration: 2400 },
      { x: 2780, y: 388, width: 126, deltaX: 170, deltaY: 0, duration: 2200 },
      { x: 3340, y: 320, width: 120, deltaX: 150, deltaY: 0, duration: 2200 }
    ];

    movingPlatforms.forEach((platform) => {
      const sprite = this.movingPlatforms.create(platform.x, platform.y, "jungle-leaf-platform") as Phaser.Physics.Arcade.Sprite;
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
      { x: 770, y: 630, patrolLeft: 680, patrolRight: 840, speed: 62, aggroRange: 180 },
      { x: 2240, y: 282, patrolLeft: 2180, patrolRight: 2300, speed: 70, aggroRange: 170 },
      { x: 3470, y: 314, patrolLeft: 3410, patrolRight: 3530, speed: 74, aggroRange: 180 }
    ];

    enemies.forEach((enemyDef) => {
      const enemy = this.enemies.create(enemyDef.x, enemyDef.y, "jungle-beast") as Phaser.Physics.Arcade.Sprite;
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

    const fruits = [
      [820, 440],
      [1610, 260],
      [2550, 212],
      [3750, 238]
    ];

    fruits.forEach(([x, y]) => {
      const fruit = this.fruits.create(x, y, "seal");
      (fruit.body as Phaser.Physics.Arcade.Body).setSize(26, 22).setOffset(1, 4);
      this.tweens.add({
        targets: fruit,
        y: y - 8,
        duration: 1000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    const checkpoints = [
      [1960, 626],
      [3430, 318]
    ];

    checkpoints.forEach(([x, y]) => {
      const checkpoint = this.checkpoints.create(x, y, "jungle-checkpoint");
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
    background.fillGradientStyle(0xf7f1e3, 0xf7f1e3, 0xe7f0d1, 0xd4e7b9, 1);
    background.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let i = 0; i < 10; i += 1) {
      const x = 220 + i * 420;
      const canopy = this.add.graphics();
      canopy.fillStyle(0x8dad7f, 0.4);
      canopy.fillEllipse(x, 190 + (i % 2) * 30, 300, 120);
      canopy.fillEllipse(x + 80, 200 + (i % 3) * 24, 240, 100);
      canopy.setScrollFactor(0.25);
    }

    const cliffs = this.add.graphics();
    cliffs.fillStyle(0xd9dfc5, 1);
    cliffs.fillRoundedRect(3050, 180, 360, 320, 44);
    cliffs.fillRoundedRect(3320, 230, 260, 220, 36);
    cliffs.setScrollFactor(0.45);

    const portalRock = this.add.graphics();
    portalRock.fillStyle(0xb59fe5, 0.55);
    portalRock.fillRoundedRect(3180, 250, 120, 170, 24);
    portalRock.setScrollFactor(0.45);

    const trees = this.add.graphics();
    trees.fillStyle(0xca9f86, 1);
    for (let i = 0; i < 14; i += 1) {
      const x = 80 + i * 320;
      trees.fillRoundedRect(x, 270 + (i % 2) * 18, 26, 240, 12);
      trees.fillRoundedRect(x + 34, 292 + (i % 3) * 12, 22, 210, 12);
    }
    trees.fillStyle(0x8dad7f, 1);
    for (let i = 0; i < 14; i += 1) {
      const x = 96 + i * 320;
      trees.fillEllipse(x, 220 + (i % 2) * 18, 250, 110);
    }
    trees.setScrollFactor(0.55);

    const vines = this.add.graphics();
    vines.lineStyle(4, 0x5f966f, 0.75);
    for (let i = 0; i < 26; i += 1) {
      const x = 480 + i * 120;
      vines.beginPath();
      vines.moveTo(x, 150 + (i % 4) * 8);
      vines.lineTo(x + 10, 300 + (i % 5) * 22);
      vines.strokePath();
    }
    vines.setScrollFactor(0.62);

    const grass = this.add.graphics();
    grass.lineStyle(4, 0x7bab65, 1);
    for (let i = 0; i < 18; i += 1) {
      const x = 120 + i * 220;
      const y = 520 + (i % 3) * 12;
      grass.beginPath();
      grass.moveTo(x, y);
      grass.lineTo(x - 10, y - 26);
      grass.lineTo(x + 4, y - 20);
      grass.lineTo(x + 14, y - 34);
      grass.strokePath();
    }
  }

  private addDecorations(): void {
    const torchLikeFireflies = [
      [380, 410],
      [1240, 288],
      [2360, 234],
      [3560, 246]
    ];

    torchLikeFireflies.forEach(([x, y]) => {
      const glow = this.add.image(x, y, "jungle-glow").setDepth(5);
      this.tweens.add({
        targets: glow,
        alpha: 0.4,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    const cliffFace = this.add.image(3948, 548, "jungle-cliff-face").setDepth(5);
    cliffFace.setScale(1.15, 1.08);

    const river = this.add.image(4068, 652, "jungle-river").setDepth(3);
    river.setScale(1.28, 1.05);

    const riverFoam = this.add.image(4058, 618, "jungle-river-foam").setDepth(15);
    riverFoam.setScale(1.35, 1);

    this.tweens.add({
      targets: riverFoam,
      y: 626,
      alpha: 0.7,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });

    const riverMist = this.add.image(4094, 642, "jungle-river-foam").setDepth(4);
    riverMist.setScale(0.92, 0.64).setAlpha(0.48);

    this.tweens.add({
      targets: riverMist,
      x: 4120,
      alpha: 0.28,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
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
    graphics.fillStyle(0x86b16b, 1);
    graphics.fillRoundedRect(0, 0, 64, 32, 12);
    graphics.fillStyle(0x5f8a47, 1);
    graphics.fillRect(0, 22, 64, 10);
    graphics.fillStyle(0xb9d78c, 0.9);
    graphics.fillEllipse(18, 10, 26, 12);
    graphics.fillEllipse(46, 8, 24, 12);
    graphics.generateTexture("jungle-ground", 64, 32);

    graphics.clear();
    graphics.fillStyle(0xa77253, 1);
    graphics.fillRoundedRect(0, 6, 64, 18, 10);
    graphics.fillStyle(0x76472f, 1);
    graphics.fillRect(8, 12, 48, 4);
    graphics.fillStyle(0x8dbc6d, 1);
    graphics.fillEllipse(12, 6, 18, 10);
    graphics.fillEllipse(32, 4, 22, 10);
    graphics.fillEllipse(50, 6, 18, 10);
    graphics.generateTexture("jungle-branch", 64, 28);

    graphics.clear();
    graphics.fillStyle(0x5e8d58, 1);
    graphics.fillRoundedRect(12, 0, 8, 64, 6);
    graphics.fillRoundedRect(0, 8, 8, 56, 6);
    graphics.fillStyle(0x7db46a, 1);
    graphics.fillEllipse(16, 10, 18, 14);
    graphics.fillEllipse(6, 22, 12, 12);
    graphics.fillEllipse(18, 34, 18, 14);
    graphics.fillEllipse(6, 48, 12, 12);
    graphics.generateTexture("jungle-vine-wall", 20, 64);

    graphics.clear();
    graphics.fillStyle(0x8ecf6e, 1);
    graphics.fillEllipse(32, 16, 64, 26);
    graphics.fillStyle(0x66aa50, 1);
    graphics.fillEllipse(32, 18, 56, 14);
    graphics.generateTexture("jungle-leaf-platform", 64, 28);

    graphics.clear();
    graphics.fillStyle(0x6fbe6a, 1);
    graphics.fillCircle(22, 18, 18);
    graphics.fillCircle(42, 18, 18);
    graphics.fillStyle(0xff7aa5, 1);
    graphics.fillCircle(32, 18, 10);
    graphics.fillStyle(0xfff0a6, 1);
    graphics.fillCircle(32, 18, 4);
    graphics.generateTexture("jungle-bloom", 64, 40);

    graphics.clear();
    graphics.fillStyle(0x6b8f3f, 1);
    graphics.fillTriangle(0, 24, 10, 0, 20, 24);
    graphics.fillStyle(0x8fba56, 1);
    graphics.fillTriangle(8, 24, 18, 0, 28, 24);
    graphics.generateTexture("jungle-thorn", 28, 24);

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
    graphics.fillStyle(0x6d5b44, 1);
    graphics.fillRect(10, 0, 12, 48);
    graphics.fillStyle(0x72b65f, 1);
    graphics.fillTriangle(22, 6, 54, 18, 22, 32);
    graphics.generateTexture("jungle-checkpoint", 56, 48);

    graphics.clear();
    graphics.fillStyle(0x4f8c55, 1);
    graphics.fillRoundedRect(8, 14, 40, 28, 12);
    graphics.fillStyle(0x7ec96f, 1);
    graphics.fillRoundedRect(12, 12, 32, 18, 10);
    graphics.fillStyle(0xf7f4dd, 1);
    graphics.fillCircle(20, 22, 4);
    graphics.fillCircle(36, 22, 4);
    graphics.fillStyle(0x222b18, 1);
    graphics.fillCircle(20, 22, 2);
    graphics.fillCircle(36, 22, 2);
    graphics.fillStyle(0xbc7a43, 1);
    graphics.fillRect(14, 40, 8, 8);
    graphics.fillRect(34, 40, 8, 8);
    graphics.generateTexture("jungle-beast", 56, 48);

    graphics.clear();
    graphics.fillStyle(0xf4ccbf, 1);
    graphics.fillCircle(30, 14, 8);
    graphics.fillStyle(0x533221, 1);
    graphics.fillEllipse(30, 10, 24, 16);
    graphics.fillRect(18, 12, 6, 22);
    graphics.fillStyle(0xf3c85a, 1);
    graphics.fillTriangle(24, 4, 38, 4, 31, 0);
    graphics.fillStyle(0x3a9860, 1);
    graphics.fillRoundedRect(18, 22, 24, 24, 8);
    graphics.fillStyle(0xf5ead8, 1);
    graphics.fillRect(24, 22, 12, 12);
    graphics.fillStyle(0x8c5a37, 1);
    graphics.fillRect(18, 45, 8, 16);
    graphics.fillRect(34, 45, 8, 16);
    graphics.fillStyle(0x7ecf94, 1);
    graphics.fillTriangle(42, 24, 54, 30, 42, 40);
    graphics.generateTexture("jungle-knight", 64, 64);

    graphics.clear();
    graphics.fillStyle(0xb59fe5, 1);
    graphics.fillRoundedRect(8, 0, 64, 92, 14);
    graphics.fillStyle(0x604796, 1);
    graphics.fillCircle(40, 30, 12);
    graphics.lineStyle(4, 0x604796, 1);
    graphics.strokeEllipse(40, 50, 34, 24);
    graphics.beginPath();
    graphics.moveTo(24, 66);
    graphics.lineTo(56, 74);
    graphics.strokePath();
    graphics.fillStyle(0xb8e47e, 1);
    graphics.fillEllipse(18, -2, 24, 12);
    graphics.fillEllipse(60, -2, 24, 12);
    graphics.generateTexture("jungle-portal", 80, 96);

    graphics.clear();
    graphics.fillStyle(0xc39d7f, 1);
    graphics.fillRoundedRect(24, 0, 132, 220, 34);
    graphics.fillStyle(0xaf8768, 1);
    graphics.fillRoundedRect(52, 20, 32, 188, 16);
    graphics.fillRoundedRect(102, 34, 28, 170, 14);
    graphics.fillStyle(0x7eaf6e, 1);
    graphics.fillEllipse(46, 24, 42, 22);
    graphics.fillEllipse(138, 44, 44, 24);
    graphics.generateTexture("jungle-cliff-face", 180, 220);

    graphics.clear();
    graphics.fillGradientStyle(0x4ba9c3, 0x4ba9c3, 0x256f86, 0x1b5569, 1);
    graphics.fillRoundedRect(0, 8, 260, 150, 34);
    graphics.fillStyle(0x90ecf7, 0.24);
    graphics.fillRect(18, 22, 180, 16);
    graphics.fillRect(54, 58, 160, 10);
    graphics.fillRect(112, 98, 118, 12);
    graphics.generateTexture("jungle-river", 260, 160);

    graphics.clear();
    graphics.fillStyle(0xe8ffff, 0.92);
    graphics.fillEllipse(72, 20, 118, 28);
    graphics.fillEllipse(142, 18, 86, 24);
    graphics.fillEllipse(98, 34, 140, 22);
    graphics.generateTexture("jungle-river-foam", 220, 52);

    graphics.clear();
    graphics.fillStyle(0xe7ffff, 0.96);
    graphics.fillEllipse(70, 38, 120, 48);
    graphics.fillEllipse(38, 52, 62, 28);
    graphics.fillEllipse(102, 58, 74, 26);
    graphics.fillStyle(0xb9eff4, 0.75);
    graphics.fillEllipse(70, 46, 92, 24);
    graphics.generateTexture("jungle-splash", 140, 90);

    graphics.clear();
    graphics.fillStyle(0xffda74, 0.9);
    graphics.fillCircle(10, 10, 10);
    graphics.fillStyle(0xfff7bf, 1);
    graphics.fillCircle(10, 10, 4);
    graphics.generateTexture("jungle-glow", 20, 20);

    graphics.destroy();
  }
}

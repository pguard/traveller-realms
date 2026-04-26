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

type SpikeDef = {
  x: number;
  y: number;
  width: number;
};

type IceKeys = {
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
const CHECKPOINT_TINT = 0xffea89;

export class IceRealmScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private portal!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private bouncePads!: Phaser.Physics.Arcade.StaticGroup;
  private icicles!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;
  private seals!: Phaser.Physics.Arcade.Group;
  private checkpoints!: Phaser.Physics.Arcade.StaticGroup;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: IceKeys;
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
    super("IceRealmScene");
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
    this.cameras.main.setBackgroundColor("#dff4ff");

    this.addBackdrop();
    this.events.off("resume");
    this.events.on("resume", this.handleResume, this);

    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });
    this.bouncePads = this.physics.add.staticGroup();
    this.icicles = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.seals = this.physics.add.group({
      allowGravity: false
    });
    this.checkpoints = this.physics.add.staticGroup();

    this.buildLevel();

    this.player = this.physics.add.sprite(this.respawnPoint.x, this.respawnPoint.y, "ice-knight");
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(1600);
    this.player.setMaxVelocity(PLAYER_SPEED + 30, 1260);
    this.player.setSize(28, 48);
    this.player.setOffset(18, 12);

    this.portal = this.physics.add.sprite(4070, 184, "ice-portal");
    (this.portal.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.portal.setImmovable(true);

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
    this.physics.add.overlap(this.player, this.icicles, () => this.tryDamage("The icicles shattered around you."), undefined, this);
    this.physics.add.overlap(this.player, this.enemies, (_obj1, obj2) => this.handleEnemyContact(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.seals, (_obj1, obj2) => this.collectSeal(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.checkpoints, (_obj1, obj2) => this.activateCheckpoint(obj2), undefined, this);
    this.physics.add.overlap(this.player, this.portal, this.finishLevel, undefined, this);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keys = this.input.keyboard?.addKeys("A,D,W,R,SHIFT,ENTER") as IceKeys;
    this.jumpKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;
    this.dashKey = this.keys.SHIFT;
    this.restartKey = this.keys.R;

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -120, 40);

    this.hudText = this.add
      .text(28, 24, "", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#ffffff",
        stroke: "#32567a",
        strokeThickness: 5
      })
      .setScrollFactor(0)
      .setDepth(30);

    this.messageText = this.add
      .text(640, 86, "The frozen tunnel opens into an icy realm.", {
        fontFamily: "Georgia, serif",
        fontSize: "28px",
        color: "#fffdf7",
        align: "center",
        stroke: "#32567a",
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
        this.messageText.setText("Watch for icicles, frost beasts, and crystal lifts.");
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
      this.tryDamage("You slid into the frozen abyss.");
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
    this.player.setTint(0xbde8ff);
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

    this.tryDamage("A frost beast snapped at your heels.");
  }

  private stompEnemy(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active) {
      return;
    }

    enemy.disableBody(true, true);
    this.player.setVelocityY(-540);
    this.airJumpsRemaining = this.getAvailableAirJumps();
    this.showMessage(this.swordEquipped ? "Sword strike!" : "Frost beast defeated.");
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
    this.showMessage("Ice marker reached.");
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
    this.portal.disableBody(true, true);
    this.player.setVelocity(90, 800);
    this.player.setAccelerationX(0);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.player.setFlipX(false);
    this.messageText.setText("");
    this.messageText.setVisible(false);
    this.messageText.setDepth(121);
    this.shopText.setVisible(false);
    this.hudText.setVisible(false);

    const lavaBurst = this.add
      .image(4078, 688, "lava-burst")
      .setAlpha(0)
      .setScale(0.58, 0.5)
      .setDepth(116);

    const blackout = this.add
      .rectangle(640, 360, 1280, 720, 0x000000, 0)
      .setScrollFactor(0)
      .setDepth(120);

    this.updateHud();

    this.time.delayedCall(520, () => {
      lavaBurst.setAlpha(0.95);
      this.tweens.add({
        targets: lavaBurst,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.1,
        duration: 900,
        ease: "Sine.Out"
      });
      this.player.setAlpha(0);
      this.cameras.main.shake(340, 0.009);
      playSound(this, "splash");
    });

    this.time.delayedCall(1080, () => {
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
          this.messageText.setText(
            "you've finished ice, you've found the knight, now you must survive the world of lava"
          );
          playSound(this, "rescue");
          this.time.delayedCall(3600, () => {
            this.scene.start("LavaRealmScene");
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
      `Level seals ${this.sealCount}/4   Wallet ${getSealBalance()}   Falls ${this.deaths}   Armor ${armorState}   Gear ${gear}   Dash ${dashState}`
    );
    this.shopText.setText(`Seal Shop ${getSealBalance()}`);
  }

  private buildLevel(): void {
    const groundSegments: PlatformDef[] = [
      { x: 220, y: 680, width: 360, texture: "ice-ground" },
      { x: 840, y: 680, width: 270, texture: "ice-ground" },
      { x: 1480, y: 680, width: 280, texture: "ice-ground" },
      { x: 2150, y: 680, width: 300, texture: "ice-ground" },
      { x: 2840, y: 680, width: 280, texture: "ice-ground" },
      { x: 3520, y: 680, width: 320, texture: "ice-ground" },
      { x: 4060, y: 680, width: 220, texture: "ice-ground" }
    ];

    const upperPlatforms: PlatformDef[] = [
      { x: 560, y: 560, width: 150, texture: "ice-platform" },
      { x: 880, y: 500, width: 130, texture: "ice-platform" },
      { x: 1160, y: 434, width: 126, texture: "ice-platform" },
      { x: 1460, y: 370, width: 136, texture: "ice-platform" },
      { x: 1760, y: 314, width: 130, texture: "ice-platform" },
      { x: 2060, y: 382, width: 150, texture: "ice-platform" },
      { x: 2390, y: 320, width: 126, texture: "ice-platform" },
      { x: 2710, y: 258, width: 130, texture: "ice-platform" },
      { x: 3020, y: 338, width: 150, texture: "ice-platform" },
      { x: 3340, y: 422, width: 130, texture: "ice-platform" },
      { x: 3640, y: 346, width: 130, texture: "ice-platform" },
      { x: 3920, y: 276, width: 180, texture: "ice-platform" }
    ];

    [...groundSegments, ...upperPlatforms].forEach((platform) => {
      const sprite = this.platforms.create(platform.x, platform.y, platform.texture ?? "ice-ground");
      const height = platform.height ?? 28;
      sprite.setDisplaySize(platform.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, platform.width, height);
    });

    const iceWalls: PlatformDef[] = [
      { x: 980, y: 590, width: 28, height: 200, texture: "ice-wall" },
      { x: 1890, y: 552, width: 28, height: 250, texture: "ice-wall" },
      { x: 3090, y: 540, width: 28, height: 220, texture: "ice-wall" }
    ];

    iceWalls.forEach((wall) => {
      const sprite = this.platforms.create(wall.x, wall.y, wall.texture ?? "ice-wall");
      const height = wall.height ?? 28;
      sprite.setDisplaySize(wall.width, height).refreshBody().setDepth(7);
      this.tuneStaticPlatformBody(sprite, wall.width, height);
    });

    const icicles: SpikeDef[] = [
      { x: 520, y: 662, width: 80 },
      { x: 1260, y: 662, width: 80 },
      { x: 2300, y: 662, width: 80 },
      { x: 3220, y: 662, width: 80 },
      { x: 3880, y: 662, width: 80 }
    ];

    icicles.forEach((spike) => {
      const count = Math.floor(spike.width / 20);
      for (let i = 0; i < count; i += 1) {
        const piece = this.icicles.create(spike.x + i * 20, spike.y, "ice-spike");
        piece.setOrigin(0, 1).refreshBody().setDepth(8);
      }
    });

    [
      [1600, 650],
      [2500, 650],
      [3480, 650]
    ].forEach(([x, y]) => {
      const pad = this.bouncePads.create(x, y, "ice-crystal");
      pad.setDepth(8);
    });

    const movingPlatforms: MovingPlatformDef[] = [
      { x: 2200, y: 500, width: 120, deltaX: 0, deltaY: -140, duration: 2400 },
      { x: 2940, y: 394, width: 130, deltaX: 180, deltaY: 0, duration: 2200 },
      { x: 3560, y: 318, width: 120, deltaX: 150, deltaY: 0, duration: 2200 }
    ];

    movingPlatforms.forEach((platform) => {
      const sprite = this.movingPlatforms.create(platform.x, platform.y, "ice-moving-platform") as Phaser.Physics.Arcade.Sprite;
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
      { x: 860, y: 630, patrolLeft: 780, patrolRight: 930, speed: 62, aggroRange: 180 },
      { x: 2390, y: 270, patrolLeft: 2330, patrolRight: 2450, speed: 72, aggroRange: 180 },
      { x: 3640, y: 296, patrolLeft: 3580, patrolRight: 3700, speed: 76, aggroRange: 180 }
    ];

    enemies.forEach((enemyDef) => {
      const enemy = this.enemies.create(enemyDef.x, enemyDef.y, "ice-beast") as Phaser.Physics.Arcade.Sprite;
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

    [
      [900, 440],
      [1760, 258],
      [2710, 208],
      [3920, 224]
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
      [2150, 626],
      [3560, 300]
    ].forEach(([x, y]) => {
      const checkpoint = this.checkpoints.create(x, y, "ice-checkpoint");
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
    background.fillGradientStyle(0xe9f7ff, 0xe9f7ff, 0xcfeeff, 0xb8e2ff, 1);
    background.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const mountains = this.add.graphics();
    mountains.fillStyle(0xa5d0ef, 0.5);
    for (let i = 0; i < 12; i += 1) {
      const x = i * 380;
      mountains.fillTriangle(x, 460, x + 140, 180, x + 280, 460);
      mountains.fillTriangle(x + 110, 460, x + 250, 220, x + 390, 460);
    }
    mountains.setScrollFactor(0.28);

    const snowyHills = this.add.graphics();
    snowyHills.fillStyle(0xe9f9ff, 1);
    for (let i = 0; i < 18; i += 1) {
      snowyHills.fillEllipse(i * 260, 600 - (i % 3) * 18, 320, 90);
    }
    snowyHills.setScrollFactor(0.58);

    const aurora = this.add.graphics();
    aurora.fillStyle(0xbef9ff, 0.15);
    aurora.fillEllipse(700, 120, 560, 90);
    aurora.fillStyle(0xd9d0ff, 0.14);
    aurora.fillEllipse(1040, 160, 620, 100);
    aurora.setScrollFactor(0.12);
  }

  private addDecorations(): void {
    [
      [420, 400],
      [1280, 298],
      [2460, 236],
      [3600, 248]
    ].forEach(([x, y]) => {
      const sparkle = this.add.image(x, y, "ice-glow").setDepth(5);
      this.tweens.add({
        targets: sparkle,
        alpha: 0.4,
        duration: 700,
        yoyo: true,
        repeat: -1,
        ease: "Sine.inOut"
      });
    });

    const lavaPool = this.add.image(4084, 690, "lava-pool").setDepth(3);
    lavaPool.setScale(1.2, 1.02);

    const lavaGlow = this.add.image(4084, 676, "lava-glow").setDepth(2);
    lavaGlow.setScale(1.24, 1);

    this.tweens.add({
      targets: lavaGlow,
      alpha: 0.38,
      duration: 760,
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
    graphics.fillStyle(0xcaecff, 1);
    graphics.fillRoundedRect(0, 0, 64, 32, 12);
    graphics.fillStyle(0x93d0f5, 1);
    graphics.fillRect(0, 22, 64, 10);
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillEllipse(18, 8, 24, 10);
    graphics.fillEllipse(46, 10, 20, 10);
    graphics.generateTexture("ice-ground", 64, 32);

    graphics.clear();
    graphics.fillStyle(0xa9dfff, 1);
    graphics.fillRoundedRect(0, 0, 64, 24, 10);
    graphics.fillStyle(0x8bc6ec, 1);
    graphics.fillRect(6, 16, 52, 4);
    graphics.fillStyle(0xf7ffff, 0.85);
    graphics.fillTriangle(4, 24, 12, 10, 20, 24);
    graphics.fillTriangle(22, 24, 30, 10, 38, 24);
    graphics.fillTriangle(40, 24, 48, 10, 56, 24);
    graphics.generateTexture("ice-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0x9fd7f6, 1);
    graphics.fillRect(0, 0, 20, 64);
    graphics.fillStyle(0xeaffff, 0.75);
    graphics.fillRect(4, 0, 5, 64);
    graphics.fillRect(12, 0, 3, 64);
    graphics.generateTexture("ice-wall", 20, 64);

    graphics.clear();
    graphics.fillStyle(0xb7eeff, 1);
    graphics.fillEllipse(32, 16, 64, 24);
    graphics.fillStyle(0xeaffff, 0.8);
    graphics.fillEllipse(32, 12, 40, 10);
    graphics.generateTexture("ice-moving-platform", 64, 24);

    graphics.clear();
    graphics.fillStyle(0xd1efff, 1);
    graphics.fillTriangle(0, 24, 10, 0, 20, 24);
    graphics.fillStyle(0xb4ddf7, 1);
    graphics.fillTriangle(8, 24, 18, 0, 28, 24);
    graphics.generateTexture("ice-spike", 28, 24);

    graphics.clear();
    graphics.fillStyle(0xaee7ff, 1);
    graphics.fillCircle(22, 18, 18);
    graphics.fillCircle(42, 18, 18);
    graphics.fillStyle(0xeaffff, 1);
    graphics.fillCircle(32, 18, 10);
    graphics.fillStyle(0x9de3f9, 1);
    graphics.fillCircle(32, 18, 4);
    graphics.generateTexture("ice-crystal", 64, 40);

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
    graphics.fillStyle(0x9ebfd5, 1);
    graphics.fillRect(10, 0, 12, 48);
    graphics.fillStyle(0xcaf4ff, 1);
    graphics.fillTriangle(22, 6, 54, 18, 22, 32);
    graphics.generateTexture("ice-checkpoint", 56, 48);

    graphics.clear();
    graphics.fillStyle(0xd7f4ff, 1);
    graphics.fillRoundedRect(8, 14, 40, 28, 12);
    graphics.fillStyle(0x9cc9f2, 1);
    graphics.fillRoundedRect(12, 12, 32, 18, 10);
    graphics.fillStyle(0x223d59, 1);
    graphics.fillCircle(20, 22, 2);
    graphics.fillCircle(36, 22, 2);
    graphics.fillStyle(0x6daed7, 1);
    graphics.fillRect(14, 40, 8, 8);
    graphics.fillRect(34, 40, 8, 8);
    graphics.generateTexture("ice-beast", 56, 48);

    graphics.clear();
    graphics.fillStyle(0xf4d3c6, 1);
    graphics.fillCircle(30, 14, 8);
    graphics.fillStyle(0x6f4d34, 1);
    graphics.fillEllipse(30, 10, 24, 16);
    graphics.fillRect(18, 12, 6, 20);
    graphics.fillStyle(0xf2d773, 1);
    graphics.fillTriangle(24, 4, 38, 4, 31, 0);
    graphics.fillStyle(0x6ec7ea, 1);
    graphics.fillRoundedRect(18, 22, 24, 24, 8);
    graphics.fillStyle(0xe8f6ff, 1);
    graphics.fillRoundedRect(22, 26, 16, 12, 4);
    graphics.fillStyle(0x7a94b5, 1);
    graphics.fillRect(18, 45, 8, 16);
    graphics.fillRect(34, 45, 8, 16);
    graphics.fillStyle(0xdff4ff, 1);
    graphics.fillTriangle(42, 22, 54, 28, 42, 38);
    graphics.generateTexture("ice-knight", 64, 64);

    graphics.clear();
    graphics.fillStyle(0xcff6ff, 1);
    graphics.fillRoundedRect(8, 0, 64, 92, 14);
    graphics.fillStyle(0x81c8ef, 1);
    graphics.fillCircle(40, 30, 12);
    graphics.lineStyle(4, 0x81c8ef, 1);
    graphics.strokeEllipse(40, 50, 34, 24);
    graphics.beginPath();
    graphics.moveTo(24, 66);
    graphics.lineTo(56, 74);
    graphics.strokePath();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillEllipse(18, -2, 24, 12);
    graphics.fillEllipse(60, -2, 24, 12);
    graphics.generateTexture("ice-portal", 80, 96);

    graphics.clear();
    graphics.fillStyle(0x741208, 1);
    graphics.fillEllipse(140, 58, 280, 92);
    graphics.fillStyle(0xc42d0d, 1);
    graphics.fillEllipse(140, 52, 250, 70);
    graphics.fillStyle(0xff6a1f, 1);
    graphics.fillEllipse(140, 46, 222, 48);
    graphics.fillStyle(0xffc341, 0.95);
    graphics.fillEllipse(92, 42, 58, 18);
    graphics.fillEllipse(164, 50, 70, 20);
    graphics.fillEllipse(214, 40, 48, 16);
    graphics.generateTexture("lava-pool", 280, 100);

    graphics.clear();
    graphics.fillStyle(0xff8d2a, 0.42);
    graphics.fillEllipse(140, 48, 300, 96);
    graphics.fillStyle(0xffd768, 0.26);
    graphics.fillEllipse(140, 40, 236, 54);
    graphics.generateTexture("lava-glow", 300, 100);

    graphics.clear();
    graphics.fillStyle(0xffdc7a, 0.96);
    graphics.fillEllipse(78, 48, 118, 44);
    graphics.fillEllipse(42, 62, 52, 24);
    graphics.fillEllipse(116, 62, 58, 22);
    graphics.fillStyle(0xff7e2a, 0.86);
    graphics.fillEllipse(78, 54, 92, 24);
    graphics.generateTexture("lava-burst", 156, 96);

    graphics.clear();
    graphics.fillStyle(0xffffff, 0.9);
    graphics.fillCircle(10, 10, 10);
    graphics.fillStyle(0xd1f7ff, 1);
    graphics.fillCircle(10, 10, 4);
    graphics.generateTexture("ice-glow", 20, 20);

    graphics.destroy();
  }
}

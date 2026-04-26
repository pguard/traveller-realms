import Phaser from "phaser";
import { playSound, unlockAudio } from "../game/audio";
import { resetProgress } from "../game/progress";

type CelebrationData = {
  realm?: "lava" | "underwater";
};

export class CelebrationScene extends Phaser.Scene {
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private infoText!: Phaser.GameObjects.Text;
  private celebrationTheme?: Phaser.Sound.BaseSound;
  private realmLabel = "the final realm";

  constructor() {
    super("CelebrationScene");
  }

  preload(): void {
    this.createTextures();
    this.load.audio("celebration-theme", "audio/celebration-trumpet-fanfare.mp3");
  }

  create(data: CelebrationData = {}): void {
    unlockAudio(this);
    this.realmLabel = data.realm === "lava" ? "the lava world" : "the underwater world";
    this.cameras.main.setBackgroundColor("#0e1528");

    this.addBackdrop();
    this.addCastle();
    this.addCrowd();
    this.addTableau();
    this.addText();
    this.startCelebrationAudio();
    this.startFireworks();
    this.events.once("shutdown", () => this.celebrationTheme?.stop());

    this.confirmKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER) as Phaser.Input.Keyboard.Key;
    this.input.on("pointerdown", () => {
      resetProgress();
      this.scene.start("CastleRescueScene");
    });
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      resetProgress();
      this.scene.start("CastleRescueScene");
    }
  }

  private addBackdrop(): void {
    const sky = this.add.graphics().setDepth(1);
    sky.fillGradientStyle(0x10172d, 0x10172d, 0x36527a, 0x1b233d, 1);
    sky.fillRect(0, 0, 1280, 720);

    const moonGlow = this.add.graphics().setDepth(2);
    moonGlow.fillStyle(0xf8f0c8, 0.1);
    moonGlow.fillCircle(1060, 116, 92);
    moonGlow.fillStyle(0xfff6dc, 0.95);
    moonGlow.fillCircle(1060, 116, 38);
    moonGlow.fillStyle(0xe8dbb7, 0.3);
    moonGlow.fillCircle(1076, 106, 10);
    moonGlow.fillCircle(1046, 128, 8);

    const stars = this.add.graphics().setDepth(2);
    stars.fillStyle(0xfbf7e4, 0.85);
    for (let i = 0; i < 70; i += 1) {
      stars.fillCircle(
        60 + (i * 173) % 1160,
        38 + (i * 61) % 260,
        i % 5 === 0 ? 2 : 1.2
      );
    }

    const haze = this.add.graphics().setDepth(3);
    haze.fillStyle(0xf4d7a8, 0.08);
    haze.fillEllipse(280, 200, 420, 120);
    haze.fillEllipse(760, 170, 520, 140);
    haze.fillEllipse(1130, 210, 360, 110);

    const aurora = this.add.graphics().setDepth(3);
    aurora.fillStyle(0x8ec4d8, 0.08);
    aurora.fillEllipse(420, 132, 620, 110);
    aurora.fillStyle(0xf3d7a0, 0.06);
    aurora.fillEllipse(860, 146, 500, 96);
  }

  private addCastle(): void {
    const farCastle = this.add.graphics().setDepth(4);
    farCastle.fillStyle(0x20304e, 0.95);
    farCastle.fillRect(140, 240, 140, 180);
    farCastle.fillRect(252, 210, 110, 210);
    farCastle.fillRect(340, 254, 120, 166);
    farCastle.fillRect(430, 224, 160, 196);
    farCastle.fillRect(566, 246, 110, 174);
    farCastle.fillRect(654, 196, 126, 224);
    farCastle.fillRect(756, 234, 180, 186);
    farCastle.fillRect(920, 216, 116, 204);
    farCastle.fillRect(1018, 246, 140, 174);

    farCastle.fillStyle(0x2c4167, 1);
    for (let x = 140; x < 1150; x += 28) {
      farCastle.fillRect(x, 224 + ((x / 28) % 2) * 8, 16, 18);
    }

    const skyline = this.add.graphics().setDepth(4);
    skyline.fillStyle(0x17253d, 0.7);
    skyline.fillRect(84, 320, 80, 120);
    skyline.fillRect(1090, 304, 94, 136);
    skyline.fillTriangle(84, 320, 124, 270, 164, 320);
    skyline.fillTriangle(1090, 304, 1137, 252, 1184, 304);

    const towers = this.add.graphics().setDepth(5);
    towers.fillStyle(0x17243c, 1);
    towers.fillRect(240, 130, 68, 320);
    towers.fillRect(606, 112, 84, 338);
    towers.fillRect(940, 146, 72, 304);
    towers.fillTriangle(240, 130, 274, 72, 308, 130);
    towers.fillTriangle(606, 112, 648, 38, 690, 112);
    towers.fillTriangle(940, 146, 976, 86, 1012, 146);

    const lights = this.add.graphics().setDepth(6);
    lights.fillStyle(0xffd896, 0.85);
    [
      [214, 292],
      [334, 316],
      [454, 280],
      [544, 328],
      [632, 266],
      [746, 304],
      [892, 292],
      [980, 318]
    ].forEach(([x, y]) => {
      lights.fillRect(x, y, 16, 22);
      lights.fillStyle(0xffe9bc, 0.16);
      lights.fillCircle(x + 8, y + 12, 30);
      lights.fillStyle(0xffd896, 0.85);
    });

    const gate = this.add.graphics().setDepth(7);
    gate.fillStyle(0x131b2e, 1);
    gate.fillRoundedRect(582, 340, 116, 160, 22);
    gate.fillStyle(0x2e3d5e, 1);
    gate.fillRoundedRect(602, 364, 76, 128, 16);
    gate.fillStyle(0xf6cf8b, 0.85);
    gate.fillCircle(666, 428, 6);

    const terrace = this.add.graphics().setDepth(9);
    terrace.fillStyle(0x6f6975, 1);
    terrace.fillRect(0, 560, 1280, 160);
    terrace.fillStyle(0x8a8290, 1);
    for (let i = 0; i < 16; i += 1) {
      terrace.fillRect(i * 80, 560, 72, 18);
    }
    terrace.fillStyle(0x4f4853, 1);
    terrace.fillRect(0, 612, 1280, 12);

    const paving = this.add.graphics().setDepth(9);
    paving.lineStyle(2, 0x59505d, 0.65);
    for (let x = 10; x < 1270; x += 92) {
      paving.beginPath();
      paving.moveTo(x, 624);
      paving.lineTo(x + 44, 718);
      paving.strokePath();
    }
    for (let y = 640; y < 720; y += 26) {
      paving.beginPath();
      paving.moveTo(0, y);
      paving.lineTo(1280, y + 12);
      paving.strokePath();
    }
  }

  private addCrowd(): void {
    const crowd = this.add.graphics().setDepth(10);
    const palette = [0x483d4c, 0x5d4e60, 0x394253, 0x6a5760];

    for (let i = 0; i < 15; i += 1) {
      const x = 36 + i * 86 + (i % 2) * 12;
      const height = 88 + (i % 4) * 12;
      const color = palette[i % palette.length];
      crowd.fillStyle(color, 0.98);
      crowd.fillCircle(x, 618 - height, 16);
      crowd.fillRoundedRect(x - 18, 620 - height, 36, height, 12);
      crowd.fillRect(x - 30, 632 - height / 2, 10, 42);
      crowd.fillRect(x + 20, 626 - height / 2, 10, 50);
      crowd.fillStyle(0xe8d6ca, 0.95);
      crowd.fillCircle(x - 5, 615 - height, 2.4);
      crowd.fillCircle(x + 5, 615 - height, 2.4);
      crowd.fillStyle(0x2b232d, 0.4);
      crowd.fillRect(x - 12, 622 - height / 2, 24, 10);
    }

    const banners = this.add.graphics().setDepth(11);
    [
      { x: 126, y: 470, color: 0x9d3644 },
      { x: 1070, y: 454, color: 0x2f5f91 }
    ].forEach(({ x, y, color }) => {
      banners.lineStyle(4, 0x4a3225, 1);
      banners.beginPath();
      banners.moveTo(x, y + 110);
      banners.lineTo(x, y - 50);
      banners.strokePath();
      banners.fillStyle(color, 1);
      banners.fillRoundedRect(x + 4, y - 36, 66, 84, 8);
      banners.fillTriangle(x + 4, y + 48, x + 70, y + 48, x + 37, y + 82);
      banners.fillStyle(0xeccf86, 0.9);
      banners.fillCircle(x + 37, y + 2, 12);
    });
  }

  private addTableau(): void {
    const spotlight = this.add.graphics().setDepth(11);
    spotlight.fillStyle(0xffe6b3, 0.08);
    spotlight.fillEllipse(640, 428, 420, 250);

    const stage = this.add.graphics().setDepth(12);
    stage.fillStyle(0x544d56, 1);
    stage.fillRoundedRect(434, 430, 412, 156, 18);
    stage.fillStyle(0x7f7680, 1);
    stage.fillRect(452, 446, 376, 14);
    stage.fillStyle(0x675e68, 1);
    stage.fillRect(472, 520, 336, 12);
    stage.fillStyle(0x8f8592, 0.45);
    stage.fillRect(456, 454, 368, 4);
    stage.fillStyle(0x3c3740, 0.6);
    stage.fillRect(450, 550, 380, 10);

    const laurels = this.add.graphics().setDepth(13);
    laurels.lineStyle(5, 0xc8a85b, 0.9);
    laurels.strokeCircle(640, 308, 92);
    for (let i = 0; i < 9; i += 1) {
      const leftAngle = Phaser.Math.DegToRad(132 + i * 9);
      const rightAngle = Phaser.Math.DegToRad(408 - i * 9);
      laurels.fillStyle(0xdcc57b, 0.92);
      laurels.fillEllipse(640 + Math.cos(leftAngle) * 90, 308 + Math.sin(leftAngle) * 90, 24, 12);
      laurels.fillEllipse(640 + Math.cos(rightAngle) * 90, 308 + Math.sin(rightAngle) * 90, 24, 12);
    }

    const knight = this.add.graphics().setDepth(14);
    knight.fillStyle(0xe8d8cc, 1);
    knight.fillCircle(700, 356, 18);
    knight.fillStyle(0x6a4f3b, 1);
    knight.fillEllipse(700, 346, 34, 18);
    knight.fillStyle(0x2e2b31, 1);
    knight.fillCircle(694, 356, 2.4);
    knight.fillCircle(706, 356, 2.4);
    knight.fillStyle(0x5d6273, 1);
    knight.fillRoundedRect(676, 376, 48, 76, 14);
    knight.fillStyle(0x7d8697, 1);
    knight.fillRoundedRect(668, 392, 64, 22, 10);
    knight.fillStyle(0xc6d0dc, 0.85);
    knight.fillRect(692, 378, 16, 74);
    knight.fillStyle(0xb6c2d2, 1);
    knight.fillRect(680, 450, 12, 54);
    knight.fillRect(708, 450, 12, 54);
    knight.fillStyle(0x9d3644, 0.95);
    knight.fillTriangle(720, 390, 762, 424, 724, 468);
    knight.fillStyle(0x8b6d3a, 1);
    knight.fillRect(724, 452, 8, 58);

    const princess = this.add.graphics().setDepth(15);
    princess.fillStyle(0xf3dccc, 1);
    princess.fillCircle(580, 350, 18);
    princess.fillStyle(0x76523d, 1);
    princess.fillEllipse(580, 340, 36, 20);
    princess.fillStyle(0x2e2b31, 1);
    princess.fillCircle(574, 352, 2.4);
    princess.fillCircle(586, 352, 2.4);
    princess.fillStyle(0xe3c85f, 1);
    princess.fillTriangle(567, 327, 593, 327, 580, 317);
    princess.fillStyle(0x8f4f7d, 1);
    princess.fillRoundedRect(554, 370, 54, 84, 18);
    princess.fillStyle(0xdab6d4, 1);
    princess.fillRoundedRect(564, 384, 34, 26, 10);
    princess.fillStyle(0xf0dcea, 0.85);
    princess.fillRect(576, 372, 10, 82);
    princess.fillStyle(0xf3dccc, 1);
    princess.fillRect(548, 392, 10, 48);
    princess.fillRect(602, 392, 10, 48);
    princess.fillStyle(0xc08c3d, 1);
    princess.fillRect(570, 454, 12, 50);
    princess.fillRect(592, 454, 12, 50);
    princess.fillStyle(0xc06a96, 0.95);
    princess.fillTriangle(554, 390, 518, 430, 556, 472);
    princess.fillStyle(0xd8c06b, 1);
    princess.fillCircle(580, 324, 4);

    const joinedHands = this.add.graphics().setDepth(16);
    joinedHands.lineStyle(5, 0xe9d6c9, 1);
    joinedHands.beginPath();
    joinedHands.moveTo(608, 400);
    joinedHands.lineTo(670, 402);
    joinedHands.strokePath();
    joinedHands.fillStyle(0xe9d6c9, 1);
    joinedHands.fillCircle(639, 401, 4);

    const ribbon = this.add.graphics().setDepth(17);
    ribbon.fillStyle(0x7d3040, 1);
    ribbon.fillRoundedRect(308, 76, 664, 114, 28);
    ribbon.fillTriangle(308, 104, 256, 133, 308, 162);
    ribbon.fillTriangle(972, 104, 1024, 133, 972, 162);
    ribbon.lineStyle(4, 0xdab66a, 0.95);
    ribbon.strokeRoundedRect(308, 76, 664, 114, 28);

    const subtitlePanel = this.add.graphics().setDepth(17);
    subtitlePanel.fillStyle(0x131827, 0.86);
    subtitlePanel.fillRoundedRect(334, 196, 612, 62, 20);
    subtitlePanel.lineStyle(3, 0xa88d55, 0.9);
    subtitlePanel.strokeRoundedRect(334, 196, 612, 62, 20);
  }

  private addText(): void {
    this.add
      .text(640, 116, "Realm Quest Complete", {
        fontFamily: '"Cinzel Decorative", Georgia, serif',
        fontSize: "30px",
        color: "#fff2c7",
        align: "center",
        wordWrap: { width: 560 }
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setShadow(0, 3, "#2b1420", 8, true, true);

    this.add
      .text(640, 227, "The princess saved the knight and returned from " + this.realmLabel + ".", {
        fontFamily: "Georgia, serif",
        fontSize: "21px",
        color: "#f4e7d6",
        align: "center",
        wordWrap: { width: 540 }
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setShadow(0, 2, "#19243b", 6, true, true);

    const plaque = this.add.graphics().setDepth(18);
    plaque.fillStyle(0x181821, 0.84);
    plaque.fillRoundedRect(356, 572, 568, 98, 18);
    plaque.lineStyle(3, 0xb89c60, 0.9);
    plaque.strokeRoundedRect(356, 572, 568, 98, 18);

    this.infoText = this.add
      .text(640, 620, "Congratulations, you have completed Realm Quest.\nPress Enter or click to begin again.", {
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "20px",
        color: "#f5efe2",
        align: "center",
        lineSpacing: 6,
        wordWrap: { width: 500 }
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: this.infoText,
      alpha: 0.7,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut"
    });
  }

  private startCelebrationAudio(): void {
    this.celebrationTheme = this.sound.add("celebration-theme", {
      loop: true,
      volume: 0.42
    });
    this.celebrationTheme.play();
  }

  private startFireworks(): void {
    const sparks = this.add.particles(0, 0, "spark", {
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      blendMode: "ADD",
      gravityY: 80,
      lifespan: { min: 700, max: 1100 },
      quantity: 0,
      scale: { start: 0.62, end: 0.08 },
      speed: { min: 90, max: 200 },
      tint: [0xffd46c, 0xff9569, 0x93d8ff]
    });
    sparks.setDepth(19);

    const launchFirework = () => {
      const x = Phaser.Math.Between(180, 1100);
      const y = Phaser.Math.Between(86, 210);
      sparks.explode(16, x, y);
      playSound(this, "firework");
    };

    this.time.delayedCall(900, launchFirework);
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: launchFirework
    });
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    graphics.clear();
    graphics.fillStyle(0xffd364, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 3);
    graphics.generateTexture("spark", 16, 16);

    graphics.destroy();
  }
}

import Phaser from "phaser";
import { playSound, unlockAudio } from "../game/audio";

type Tunnel = {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Rectangle;
  hotspot: Phaser.GameObjects.Zone;
  key: "jungle" | "ice";
};

type ChoiceKeys = {
  A: Phaser.Input.Keyboard.Key;
  D: Phaser.Input.Keyboard.Key;
  ENTER: Phaser.Input.Keyboard.Key;
  LEFT: Phaser.Input.Keyboard.Key;
  RIGHT: Phaser.Input.Keyboard.Key;
  SPACE: Phaser.Input.Keyboard.Key;
};

export class RealmChoiceScene extends Phaser.Scene {
  private tunnels: Tunnel[] = [];
  private infoText!: Phaser.GameObjects.Text;
  private keys!: ChoiceKeys;
  private selectedIndex = 0;

  constructor() {
    super("RealmChoiceScene");
  }

  create(data: { deaths?: number; seals?: number }): void {
    unlockAudio(this);
    this.cameras.main.setBackgroundColor("#20141e");
    this.drawBackdrop();

    this.add
      .text(640, 76, "Two tunnels open ahead", {
        fontFamily: "Georgia, serif",
        fontSize: "46px",
        color: "#f7ead5"
      })
      .setOrigin(0.5);

    this.add
      .text(
        640,
        126,
        `The knight is safe. You found ${data.seals ?? 0}/5 seals and fell ${data.deaths ?? 0} times.\nNo one can see what lies beyond either tunnel.`,
        {
          align: "center",
          color: "#ddcdb8",
          fontFamily: '"Trebuchet MS", sans-serif',
          fontSize: "22px",
          lineSpacing: 8
        }
      )
      .setOrigin(0.5);

    this.tunnels = [
      this.createTunnel(360, 430, "jungle"),
      this.createTunnel(920, 430, "ice")
    ];

    this.infoText = this.add
      .text(640, 666, "Choose a tunnel. Press Enter or click to commit.", {
        color: "#f4e8d4",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "22px"
      })
      .setOrigin(0.5);

    this.keys = this.input.keyboard?.addKeys("LEFT,RIGHT,ENTER,SPACE,A,D") as ChoiceKeys;
    this.updateSelection();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.LEFT) || Phaser.Input.Keyboard.JustDown(this.keys.A)) {
      this.selectedIndex = 0;
      this.updateSelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.RIGHT) || Phaser.Input.Keyboard.JustDown(this.keys.D)) {
      this.selectedIndex = 1;
      this.updateSelection();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      this.confirmSelection();
    }
  }

  private createTunnel(x: number, y: number, key: "jungle" | "ice"): Tunnel {
    const container = this.add.container(x, y);
    container.setSize(360, 360);

    const frame = this.add.rectangle(0, 0, 360, 360, 0x3d2930, 0.9).setStrokeStyle(4, 0x8a6a52);
    const floor = this.add.rectangle(0, 136, 360, 88, 0x6f5440, 1);
    const arch = this.add.graphics();
    arch.fillStyle(0x5d4234, 1);
    arch.fillRoundedRect(-126, -118, 252, 236, 44);
    arch.fillStyle(0x100c12, 1);
    arch.fillRoundedRect(-88, -82, 176, 204, 58);

    const stones = this.add.graphics();
    stones.fillStyle(0x8f735e, 1);
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        stones.fillRoundedRect(-142 + col * 48, -150 + row * 40, 40, 24, 6);
      }
    }

    const torchGlow = this.add.graphics();
    torchGlow.fillStyle(0xf3cb7f, 0.08);
    torchGlow.fillCircle(-110, -24, 48);
    torchGlow.fillCircle(110, -24, 48);
    torchGlow.fillStyle(0xffd27a, 1);
    torchGlow.fillCircle(-110, -22, 10);
    torchGlow.fillCircle(110, -22, 10);

    const plaque = this.add
      .text(0, 152, key === "jungle" ? "Left Tunnel" : "Right Tunnel", {
        color: "#f3e2ca",
        fontFamily: "Georgia, serif",
        fontSize: "26px"
      })
      .setOrigin(0.5);

    container.add([frame, floor, arch, stones, torchGlow, plaque]);

    const hotspot = this.add
      .zone(x, y, 360, 360)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    hotspot.on("pointerover", () => {
      this.selectedIndex = key === "jungle" ? 0 : 1;
      this.updateSelection();
    });

    hotspot.on("pointerdown", () => {
      this.selectedIndex = key === "jungle" ? 0 : 1;
      this.updateSelection();
    });

    hotspot.on("pointerup", () => {
      this.selectedIndex = key === "jungle" ? 0 : 1;
      this.updateSelection();
      this.confirmSelection();
    });

    return { container, frame, hotspot, key };
  }

  private updateSelection(): void {
    this.tunnels.forEach((tunnel, index) => {
      const selected = index === this.selectedIndex;
      tunnel.container.setScale(selected ? 1.04 : 0.98);
      tunnel.frame.setStrokeStyle(5, selected ? 0xf3c562 : 0x8a6a52);
    });

    this.infoText.setText(
      this.selectedIndex === 0
        ? "The left tunnel waits in silence."
        : "The right tunnel waits in silence."
    );
  }

  private confirmSelection(): void {
    const selected = this.tunnels[this.selectedIndex];
    playSound(this, "select");
    this.cameras.main.flash(300, 213, 255, 199);
    this.time.delayedCall(220, () => {
      this.scene.start(selected.key === "jungle" ? "JungleRealmScene" : "IceRealmScene");
    });
  }

  private drawBackdrop(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x20141e, 0x20141e, 0x46313a, 0x28181f, 1);
    sky.fillRect(0, 0, 1280, 720);

    const mist = this.add.graphics();
    mist.fillStyle(0xf4d9b7, 0.08);
    for (let i = 0; i < 12; i += 1) {
      mist.fillEllipse(100 + i * 120, 560 - (i % 3) * 18, 240, 90);
    }

    const floor = this.add.graphics();
    floor.fillStyle(0x5c4237, 1);
    floor.fillRect(0, 560, 1280, 160);
    floor.fillStyle(0x7a5e4d, 1);
    for (let i = 0; i < 16; i += 1) {
      floor.fillRect(i * 80, 560, 72, 22);
    }
  }
}

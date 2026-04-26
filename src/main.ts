import Phaser from "phaser";
import { resetProgress } from "./game/progress";
import { CastleRescueScene } from "./scenes/CastleRescueScene";
import { CelebrationScene } from "./scenes/CelebrationScene";
import { IceRealmScene } from "./scenes/IceRealmScene";
import { JungleRealmScene } from "./scenes/JungleRealmScene";
import { LavaRealmScene } from "./scenes/LavaRealmScene";
import { RealmChoiceScene } from "./scenes/RealmChoiceScene";
import { ShopScene } from "./scenes/ShopScene";
import { UnderwaterRealmScene } from "./scenes/UnderwaterRealmScene";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Phaser 3 Platform Adventure</p>
      <h1 class="game-title">Realm Quest</h1>
      <p class="lede">
        Sprint, wall-jump, and double-jump through a trapped stone fortress as the princess on a quest to save the knight.
      </p>
      <div class="controls">
        <span><strong>Move</strong> A / D or Arrow Keys</span>
        <span><strong>Jump</strong> Space, W, or Up</span>
        <span><strong>Dash</strong> Shift</span>
        <span><strong>Shop</strong> Click seal button</span>
        <span><strong>Choose Path</strong> Enter or Click</span>
        <span><strong>Restart</strong> R</span>
      </div>
    </section>
    <section class="stage-card">
      <div class="stage-frame">
        <div id="game-root" class="game-root" aria-label="Realm Quest game canvas"></div>
      </div>
    </section>
  </main>
`;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#0f0b19",
  width: 1280,
  height: 720,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 1800, x: 0 },
      debug: false
    }
  },
  scene: [
    CastleRescueScene,
    CelebrationScene,
    RealmChoiceScene,
    JungleRealmScene,
    IceRealmScene,
    LavaRealmScene,
    UnderwaterRealmScene,
    ShopScene
  ],
  render: {
    pixelArt: false,
    antialias: true
  }
};

resetProgress();

new Phaser.Game(config);

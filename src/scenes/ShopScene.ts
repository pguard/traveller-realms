import Phaser from "phaser";
import { playSound, unlockAudio } from "../game/audio";
import {
  getProgress,
  getSwordCharges,
  isUpgradeEquipped,
  purchaseUpgrade,
  SHOP_ITEMS,
  toggleEquip,
  type ShopItemId
} from "../game/progress";

type ShopKeys = {
  DOWN: Phaser.Input.Keyboard.Key;
  ENTER: Phaser.Input.Keyboard.Key;
  ESC: Phaser.Input.Keyboard.Key;
  LEFT: Phaser.Input.Keyboard.Key;
  RIGHT: Phaser.Input.Keyboard.Key;
  SPACE: Phaser.Input.Keyboard.Key;
  UP: Phaser.Input.Keyboard.Key;
};

export class ShopScene extends Phaser.Scene {
  private balanceText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private itemActions: Array<() => void> = [];
  private itemSelectionRefreshers: Array<(selected: boolean) => void> = [];
  private keys!: ShopKeys;
  private returnScene = "CastleRescueScene";
  private cardRefreshers: Array<() => void> = [];
  private selectedIndex = 0;

  constructor() {
    super("ShopScene");
  }

  create(data: { returnScene?: string }): void {
    unlockAudio(this);
    this.returnScene = data.returnScene ?? "CastleRescueScene";
    this.cardRefreshers = [];
    this.itemActions = [];
    this.itemSelectionRefreshers = [];
    this.selectedIndex = 0;

    this.add.rectangle(640, 360, 1280, 720, 0x08100d, 0.7);

    const panel = this.add.rectangle(640, 360, 1080, 560, 0xf7f0df, 0.98);
    panel.setStrokeStyle(4, 0xd8be83);

    this.add
      .text(640, 108, "Seal Shop", {
        color: "#3f2f24",
        fontFamily: "Georgia, serif",
        fontSize: "44px"
      })
      .setOrigin(0.5);

    this.balanceText = this.add
      .text(640, 154, "", {
        color: "#5e4b38",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "24px"
      })
      .setOrigin(0.5);

    this.infoText = this.add
      .text(640, 596, "Buy gear, then equip what you want to take into battle.", {
        color: "#5e4b38",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "21px"
      })
      .setOrigin(0.5);

    SHOP_ITEMS.forEach((item, index) => {
      this.createItemCard(item, 220 + index * 220, 360);
    });

    const closeButton = this.add
      .text(1100, 112, "Close", {
        color: "#6d4d3b",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "22px",
        backgroundColor: "#f2ddba",
        padding: { x: 12, y: 8 }
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    closeButton.on("pointerdown", () => {
      playSound(this, "select");
      this.closeShop();
    });

    this.keys = this.input.keyboard?.addKeys(
      "ESC,LEFT,RIGHT,UP,DOWN,ENTER,SPACE"
    ) as ShopKeys;
    this.refreshTexts();
    this.refreshSelection();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      playSound(this, "select");
      this.closeShop();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.LEFT) || Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
      this.moveSelection(-1);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.RIGHT) || Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
      this.moveSelection(1);
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      const action = this.itemActions[this.selectedIndex];

      if (action) {
        action();
      }
    }
  }

  private createItemCard(item: (typeof SHOP_ITEMS)[number], x: number, y: number): void {
    const index = this.itemActions.length;
    const container = this.add.container(x, y);
    const card = this.add.rectangle(0, 0, 188, 326, 0xfffbf1, 1);
    card.setStrokeStyle(3, 0xdfc68e);
    const iconCircle = this.add.circle(0, -90, 40, 0xf3e3c0);
    iconCircle.setStrokeStyle(2, 0xd8be83);

    const icon = this.createItemIcon(item.id);
    icon.setPosition(0, -92);

    const title = this.add
      .text(0, -26, item.name, {
        color: "#3f2f24",
        fontFamily: "Georgia, serif",
        fontSize: "26px",
        align: "center",
        wordWrap: { width: 160 }
      })
      .setOrigin(0.5);

    const cost = this.add
      .text(0, 26, `${item.cost} seals`, {
        color: "#55754a",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "22px"
      })
      .setOrigin(0.5);

    const description = this.add
      .text(0, 92, item.description, {
        color: "#665345",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "18px",
        align: "center",
        wordWrap: { width: 150 }
      })
      .setOrigin(0.5);

    const badge = this.add
      .text(0, 136, "", {
        color: "#6f583f",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "18px",
        backgroundColor: "#f4e4c5",
        padding: { x: 10, y: 6 }
      })
      .setOrigin(0.5);

    const actionButton = this.add.rectangle(0, 184, 140, 42, 0x6e9361, 1);
    actionButton.setStrokeStyle(2, 0x4f6d45);

    const actionText = this.add
      .text(0, 184, "", {
        color: "#fff8e8",
        fontFamily: '"Trebuchet MS", sans-serif',
        fontSize: "20px"
      })
      .setOrigin(0.5);

    container.add([card, iconCircle, icon, title, cost, description, actionButton, actionText, badge]);
    const activate = () => this.handleItemAction(item.id, item.name);
    const hover = () => {
      this.selectedIndex = index;
      this.refreshSelection();
    };

    card.setInteractive({ useHandCursor: true });
    card.on("pointerover", hover);
    card.on("pointerdown", activate);

    actionButton.setInteractive({ useHandCursor: true });
    actionButton.on("pointerover", hover);
    actionButton.on("pointerdown", activate);

    actionText.setInteractive({ useHandCursor: true });
    actionText.on("pointerover", hover);
    actionText.on("pointerdown", activate);

    const refreshCard = () => {
      const progress = getProgress();
      const swordCharges = getSwordCharges();
      const owned = item.id === "sword" ? swordCharges > 0 : Boolean(progress.owned[item.id]);
      const equipped = isUpgradeEquipped(item.id);

      if (!owned) {
        badge.setText("Not bought");
        actionText.setText("Buy");
        actionButton.setFillStyle(0x6e9361, 1);
      } else if (equipped) {
        badge.setText(item.id === "sword" ? `${swordCharges} levels left` : "Equipped");
        actionText.setText("Unequip");
        actionButton.setFillStyle(0x8c5a4f, 1);
      } else {
        badge.setText(item.id === "sword" ? `${swordCharges} levels left` : "Owned");
        actionText.setText("Equip");
        actionButton.setFillStyle(0x4f7394, 1);
      }
    };

    this.cardRefreshers.push(refreshCard);
    this.itemActions.push(activate);
    this.itemSelectionRefreshers.push((selected: boolean) => {
      card.setStrokeStyle(selected ? 5 : 3, selected ? 0xc99335 : 0xdfc68e);
      iconCircle.setStrokeStyle(selected ? 4 : 2, selected ? 0xc99335 : 0xd8be83);
      card.setFillStyle(selected ? 0xfff4da : 0xfffbf1, 1);
    });
    refreshCard();
  }

  private createItemIcon(itemId: ShopItemId): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics();

    if (itemId === "sword") {
      graphics.fillStyle(0xc9d3df, 1);
      graphics.fillTriangle(0, -40, -10, -20, 10, -20);
      graphics.fillRect(-5, -20, 10, 42);
      graphics.fillStyle(0x8ca1b7, 1);
      graphics.fillRect(-2, -20, 4, 40);
      graphics.fillStyle(0x9f6c45, 1);
      graphics.fillRoundedRect(-18, 8, 36, 8, 4);
      graphics.fillRect(-6, 16, 12, 16);
      graphics.fillStyle(0xe8c56b, 1);
      graphics.fillCircle(0, 12, 4);
      return graphics;
    }

    if (itemId === "armor") {
      graphics.fillStyle(0x8f9daa, 1);
      graphics.fillTriangle(-28, -18, -10, -32, 0, -12);
      graphics.fillTriangle(28, -18, 10, -32, 0, -12);
      graphics.fillRoundedRect(-28, -16, 56, 54, 16);
      graphics.fillStyle(0xcfd9e3, 1);
      graphics.fillRoundedRect(-10, -10, 20, 42, 8);
      graphics.fillStyle(0x5b6b7a, 1);
      graphics.fillRect(-3, -4, 6, 30);
      return graphics;
    }

    if (itemId === "jumpBoots") {
      graphics.fillStyle(0x855438, 1);
      graphics.fillRoundedRect(-30, -4, 24, 28, 8);
      graphics.fillRoundedRect(6, 2, 24, 22, 8);
      graphics.fillStyle(0xd9b455, 1);
      graphics.fillRect(-34, 18, 30, 8);
      graphics.fillRect(2, 18, 32, 8);
      graphics.fillStyle(0xffee9b, 1);
      graphics.fillTriangle(-18, -28, -6, -10, -22, -10);
      graphics.fillTriangle(18, -22, 6, -6, 22, -6);
      return graphics;
    }

    graphics.fillStyle(0xeaf4fb, 1);
    graphics.fillEllipse(-18, 2, 22, 54);
    graphics.fillEllipse(18, 2, 22, 54);
    graphics.fillStyle(0xc8dfee, 1);
    graphics.fillEllipse(-18, 2, 12, 40);
    graphics.fillEllipse(18, 2, 12, 40);
    graphics.fillStyle(0xf9ffff, 0.9);
    graphics.fillEllipse(-28, -8, 14, 18);
    graphics.fillEllipse(28, -8, 14, 18);
    return graphics;
  }

  private refreshTexts(): void {
    this.balanceText.setText(`Wallet: ${getProgress().seals} baby seals`);
    this.cardRefreshers.forEach((refresh) => refresh());
  }

  private moveSelection(direction: -1 | 1): void {
    if (this.itemSelectionRefreshers.length === 0) {
      return;
    }

    this.selectedIndex =
      (this.selectedIndex + direction + this.itemSelectionRefreshers.length) %
      this.itemSelectionRefreshers.length;
    playSound(this, "select");
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.itemSelectionRefreshers.forEach((refresh, index) => {
      refresh(index === this.selectedIndex);
    });
  }

  private handleItemAction(itemId: ShopItemId, itemName: string): void {
    const progress = getProgress();
    const owned = itemId === "sword" ? getSwordCharges() > 0 : Boolean(progress.owned[itemId]);

    if (!owned) {
      const result = purchaseUpgrade(itemId);

      if (!result.ok) {
        playSound(this, "deny");
        this.infoText.setText(result.reason ?? "Could not buy that item.");
      } else {
        playSound(this, "seal");
        this.infoText.setText(
          itemId === "sword"
            ? `${itemName} purchased. It has 2 level uses. Equip it before battle.`
            : `${itemName} purchased. Equip it before battle.`
        );
      }
    } else {
      const result = toggleEquip(itemId);

      if (!result.ok) {
        playSound(this, "deny");
        this.infoText.setText(result.reason ?? "Could not equip that item.");
      } else {
        playSound(this, "select");
        this.infoText.setText(result.equipped ? `${itemName} equipped.` : `${itemName} unequipped.`);
      }
    }

    this.refreshTexts();
  }

  private closeShop(): void {
    this.scene.stop();
    this.scene.resume(this.returnScene);
  }
}

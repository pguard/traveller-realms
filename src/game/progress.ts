export type ShopItemId = "sword" | "armor" | "jumpBoots" | "wings";

export type ShopItem = {
  cost: number;
  description: string;
  id: ShopItemId;
  name: string;
};

export type OwnedState = Record<Exclude<ShopItemId, "sword">, boolean>;
export type EquippedState = Record<ShopItemId, boolean>;

export type LevelLoadout = {
  armor: boolean;
  extraAirJumps: number;
  jumpBoots: boolean;
  sword: boolean;
  wings: boolean;
};

type ProgressState = {
  equipped: EquippedState;
  owned: OwnedState;
  seals: number;
  swordCharges: number;
};

const STORAGE_KEY = "castlebound-progress";

const DEFAULT_PROGRESS: ProgressState = {
  equipped: {
    sword: false,
    armor: false,
    jumpBoots: false,
    wings: false
  },
  seals: 0,
  owned: {
    armor: false,
    jumpBoots: false,
    wings: false
  },
  swordCharges: 0
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "sword",
    name: "Sword",
    cost: 2,
    description: "Equip it to defeat monsters on touch. Each sword lasts for 2 levels."
  },
  {
    id: "armor",
    name: "Armor",
    cost: 5,
    description: "Equip it to absorb one hit in a level."
  },
  {
    id: "jumpBoots",
    name: "Jump Boots",
    cost: 10,
    description: "Equip them for 1 extra air jump."
  },
  {
    id: "wings",
    name: "Wings",
    cost: 15,
    description: "Equip them for 3 extra air jumps."
  }
];

let progressCache: ProgressState | null = null;

function cloneProgress(progress: ProgressState): ProgressState {
  return {
    equipped: { ...progress.equipped },
    seals: progress.seals,
    owned: { ...progress.owned },
    swordCharges: progress.swordCharges
  };
}

function hasItem(progress: ProgressState, itemId: ShopItemId): boolean {
  return itemId === "sword" ? progress.swordCharges > 0 : progress.owned[itemId];
}

function buildLoadout(progress: ProgressState): LevelLoadout {
  const sword = progress.equipped.sword && progress.swordCharges > 0;
  const armor = progress.equipped.armor && progress.owned.armor;
  const jumpBoots = progress.equipped.jumpBoots && progress.owned.jumpBoots;
  const wings = progress.equipped.wings && progress.owned.wings;

  return {
    armor,
    extraAirJumps: (jumpBoots ? 1 : 0) + (wings ? 3 : 0),
    jumpBoots,
    sword,
    wings
  };
}

function loadProgress(): ProgressState {
  if (progressCache) {
    return progressCache;
  }

  if (typeof window === "undefined") {
    progressCache = cloneProgress(DEFAULT_PROGRESS);
    return progressCache;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      progressCache = cloneProgress(DEFAULT_PROGRESS);
      return progressCache;
    }

    const parsed = JSON.parse(raw) as Partial<ProgressState> & {
      owned?: Partial<Record<ShopItemId, boolean>>;
      equipped?: Partial<Record<ShopItemId, boolean>>;
      swordCharges?: number;
    };
    const legacySwordOwned = Boolean(parsed.owned?.sword);
    progressCache = {
      equipped: {
        sword: Boolean(parsed.equipped?.sword),
        armor: Boolean(parsed.equipped?.armor),
        jumpBoots: Boolean(parsed.equipped?.jumpBoots),
        wings: Boolean(parsed.equipped?.wings)
      },
      seals: typeof parsed.seals === "number" ? parsed.seals : 0,
      owned: {
        armor: Boolean(parsed.owned?.armor),
        jumpBoots: Boolean(parsed.owned?.jumpBoots),
        wings: Boolean(parsed.owned?.wings)
      },
      swordCharges:
        typeof parsed.swordCharges === "number"
          ? Math.max(0, parsed.swordCharges)
          : legacySwordOwned
            ? 2
            : 0
    };
  } catch {
    progressCache = cloneProgress(DEFAULT_PROGRESS);
  }

  return progressCache;
}

function saveProgress(): void {
  if (typeof window === "undefined" || !progressCache) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progressCache));
}

export function resetProgress(): void {
  progressCache = cloneProgress(DEFAULT_PROGRESS);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progressCache));
}

export function getProgress(): ProgressState {
  return cloneProgress(loadProgress());
}

export function getSealBalance(): number {
  return loadProgress().seals;
}

export function getSwordCharges(): number {
  return loadProgress().swordCharges;
}

export function addSeals(count: number): number {
  const progress = loadProgress();
  progress.seals += count;
  saveProgress();
  return progress.seals;
}

export function hasUpgrade(itemId: ShopItemId): boolean {
  return hasItem(loadProgress(), itemId);
}

export function isUpgradeEquipped(itemId: ShopItemId): boolean {
  const progress = loadProgress();
  return progress.equipped[itemId] && hasItem(progress, itemId);
}

export function getEquippedLoadout(): LevelLoadout {
  return buildLoadout(loadProgress());
}

export function prepareEquippedLoadout(): LevelLoadout {
  const progress = loadProgress();
  const loadout = buildLoadout(progress);

  if (loadout.sword) {
    progress.swordCharges = Math.max(0, progress.swordCharges - 1);

    if (progress.swordCharges === 0) {
      progress.equipped.sword = false;
    }

    saveProgress();
  }

  return loadout;
}

export function toggleEquip(
  itemId: ShopItemId
): { equipped?: boolean; ok: boolean; reason?: string } {
  const progress = loadProgress();

  if (!hasItem(progress, itemId)) {
    return { ok: false, reason: "Buy it first." };
  }

  progress.equipped[itemId] = !progress.equipped[itemId];

  if (itemId === "sword" && progress.swordCharges <= 0) {
    progress.equipped.sword = false;
    return { ok: false, reason: "That sword is out of levels." };
  }

  saveProgress();
  return { equipped: progress.equipped[itemId], ok: true };
}

export function purchaseUpgrade(
  itemId: ShopItemId
): { ok: boolean; reason?: string; seals: number } {
  const progress = loadProgress();
  const item = SHOP_ITEMS.find((entry) => entry.id === itemId);

  if (!item) {
    return { ok: false, reason: "Unknown item.", seals: progress.seals };
  }

  if (itemId !== "sword" && progress.owned[itemId]) {
    return { ok: false, reason: "Already bought. Equip it in the shop.", seals: progress.seals };
  }

  if (progress.seals < item.cost) {
    return { ok: false, reason: "Not enough seals.", seals: progress.seals };
  }

  progress.seals -= item.cost;

  if (itemId === "sword") {
    progress.swordCharges += 2;
  } else {
    progress.owned[itemId] = true;
  }

  saveProgress();
  return { ok: true, seals: progress.seals };
}

# Realm Quest

`Realm Quest` is a browser-based fantasy platform game built with `Phaser 3`, `Vite`, and `TypeScript`.

You play as a princess crossing multiple realms to save the knight:
- Castle
- Jungle
- Ice
- Lava
- Underwater

The game includes:
- Platforming movement with jumping, dashing, and realm-specific traversal
- Enemies, traps, moving platforms, and checkpoints
- A seal-based shop with equipable upgrades
- Branching realm choices
- A custom celebration ending scene

## Tech Stack

- `Phaser 3`
- `Vite`
- `TypeScript`

## Requirements

- `Node.js` 20+ recommended
- `npm`

## Install

```bash
npm ci
```

## Run Locally

Start the dev server:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/
```

## Build

Create a production build:

```bash
npm run build
```

The output is written to:

```text
dist/
```

## Project Structure

```text
src/
  game/
    audio.ts
    progress.ts
  scenes/
    CastleRescueScene.ts
    CelebrationScene.ts
    IceRealmScene.ts
    JungleRealmScene.ts
    LavaRealmScene.ts
    RealmChoiceScene.ts
    ShopScene.ts
    UnderwaterRealmScene.ts
  main.ts
  styles.css

public/
  audio/
  images/
```

## Assets And Audio

Not all visuals are stored as image files.

- Many in-game objects and characters are drawn procedurally in the scene code using Phaser graphics.
- Most short sound effects are synthesized in `src/game/audio.ts`.
- Longer celebration media lives in `public/audio` and `public/images`.

## Notes For Collaborators

- `dist/` is not committed. Build it locally when needed.
- `node_modules/` is not committed. Install dependencies with `npm ci`.
- Player/shop progress is stored in browser local storage during play.
- The game currently uses a single bundle, so Vite may show a large chunk warning during production builds. The build still succeeds.

## Deployment

This project is a static web build.

Typical deployment flow:

```bash
npm run build
```

Then upload the contents of `dist/` to your static hosting target.

Because `vite.config.ts` uses a relative base path, the built files can be hosted from a subfolder rather than only from a site root.

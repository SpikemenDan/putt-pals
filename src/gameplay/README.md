# Gameplay framework (G1a)

Power-up framework from ARCHITECTURE.md "Gameplay systems". Plain ESM, no DOM, Three.js, PeerJS or WebAudio; randomness is injected.

| File | Role |
| --- | --- |
| `catalog.js` | `POWERUP_CATALOG`: id, name, group, target (`self` or `opponent`), solo flag, spawn weight, duration (`next-shot` or `stroke`), hook, banner and toast. Single source for the HUD, protocol validation, spawn table and solo filtering. `catalogProblems()` validates a catalog; `spawnPool()` filters it (solo keeps self-only entries, `powerups: false` is the No Power-Ups mode and returns nothing); `rollPowerup(pool, random)` is the weighted, seedable pick. |
| `inventory.js` | Three slots (`MAX_INVENTORY`), `addToInventory`/`takeFromInventory`, and `powerupPolicy({ mode, rosterSize, powerups })`: tournaments carry the inventory across putts and rounds, every other mode resets it. |
| `effects.js` | `activatePowerup` arms a self effect in `player.armedPowerups` (several stack on one shot; arming twice is refused without using the item) or returns an effect message `{ id, t }` for an opponent effect; `clearAtLaunch`, `receiveEffect`, `auraOf`, and `validEffectMessage`, which presence validation (`src/network`) uses for `fx`. |

Shipped entries: Hole Magnet (`mag`, per-tick force in the cup physics) and Steady Aim (`steady`, removes sway in the input layer). Rewind, Reversiball and Zanyball are removed, including their `rev`/`zany` presence values. No shipped entry is opponent-targeted yet, so every presence `fx` is rejected until one is added to the catalog.

With nothing armed no hook changes any number, so shot results stay bit-identical to the parity fixtures. Adding a power-up means adding a catalog record, its hook, an aura colour in `src/render/materials.js`, and tests; the catalog tests (`tests/gameplay.test.cjs`, part of `npm run test:contracts`) cover the framework with a catalog that includes an opponent-targeted entry.

The renderer still draws `?` boxes in No Power-Ups sessions; hiding them belongs to GM1, which also supplies the session flag `powerupPolicy` reads.

# Gameplay framework (G1a)

Power-up framework from ARCHITECTURE.md "Gameplay systems". Plain ESM, no DOM, Three.js, PeerJS or WebAudio; randomness is injected.

| File | Role |
| --- | --- |
| `catalog.js` | `POWERUP_CATALOG`: id, name, group, target (`self`, `opponent`, `course` or `global`), solo flag, spawn weight, duration, hook, banner and toast. Single source for the HUD, protocol validation, spawn table and solo filtering. `catalogProblems()` validates a catalog; `spawnPool()` filters it (solo keeps self-only entries, `powerups: false` is the No Power-Ups mode and returns nothing); `rollPowerup(pool, random)` is the weighted, seedable pick. |
| `global-hazards.js` | Validates and creates room-authoritative timed G1f records, derives repeatable roaming centres and evaluates continuous effects. Room snapshots persist activations; physics reads shared tuning; targeted Lightning is applied by the target client once during its short delivery window. |
| `world-weather.js` | VIS-E #166: one Precipitation power-up (the `rain` and `snow` items) that becomes the place's weather when used: Rain or Snow on Gaia by the course's climate, Dust Storm on Ares, Solar Wind on Luna, same slippery effect; Lightning shows as a Solar Bolt on Luna. `coursePlace(course)` gives `{world, climate}`; `hazardVariant(kind, place)` gives the name, banner, toast and look; `weatherPool` keeps `snow` out of boxes. The catalog and hazard kinds are unchanged, so physics and the simulation fingerprint are too. |
| `inventory.js` | Three slots (`MAX_INVENTORY`), `addToInventory`/`takeFromInventory`, and `powerupPolicy({ mode, rosterSize, powerups })`: tournaments carry the inventory across putts and rounds, every other mode resets it. |
| `effects.js` | `activatePowerup` arms a self effect in `player.armedPowerups` (several stack on one shot; arming twice is refused without using the item) or returns an effect message `{ id, t }` for an opponent effect; `clearAtLaunch`, `receiveEffect`, `auraOf`, and `validEffectMessage`, which presence validation (`src/network`) uses for `fx`. |

Shipped entries include seven self effects, two aim attacks, two ball auras, two deployables and six global hazards. Rewind, Reversiball and Zanyball are removed, including their `rev`/`zany` presence values. Opponent aim attacks use the validated presence `fx` format; Lightning uses a room activation record and an explicit target.

With nothing armed no hook changes any number, so shot results stay bit-identical to the parity fixtures. Adding a power-up means adding a catalog record, its hook, an aura colour in `src/render/materials.js`, and tests; the catalog tests (`tests/gameplay.test.cjs`, part of `npm run test:contracts`) cover the framework with a catalog that includes an opponent-targeted entry.

No Power-Ups (GM1): the room flag `powerups` (host-set in the lobby with `SET_POWERUPS`, default true) is read by `app.js` into `powerupPolicy({ powerups })`. With it off the policy has `spawn: false` and `boxes: false`, and `createPutt` marks every `?` block collected, so none is drawn or touchable and the inventory stays empty. Practice and solo modes always keep power-ups on.

# Map of Gaia

Gaia is an invented planet built on the logic of real Earth. Regions and ranges live in `src/shared/gaia-map.js`; coastlines live in `src/shared/gaia-coast.js` as closed paths you can edit by hand. The globe fills those paths and the atlas strokes them, so one edit moves both. Each map has a small flag on the globe. The level select is this world laid flat in 3D (`src/render/atlas-scene.js`, `src/ui/WorldSelect.jsx`): `?map` on the dev server goes straight to it. `REGION_COURSES` places the 22 real courses in the regions, and picking one casts the normal vote. Without WebGL the plain course list shows.

## How it follows Earth

- **Land:** about a third of the surface, with most of it north of the equator. Norvane and Sudara lie west, Aurelia and Kesh east, Ostrel to the south-east, ice at both poles.
- **Mountains:** long chains down western coasts, and the highest range where two blocks of land meet.
- **Rain:** worked out from the winds, not painted. Trade winds blow west in the tropics and westerlies blow east in the mid-latitudes, losing water over land and over mountains. That gives wet windward coasts, dry interiors and rain shadows.
- **Biomes:** rainforest on the equator, then savanna, then hot deserts near 25 degrees, Mediterranean coasts near 35, temperate forest and grassland in the mid-latitudes, boreal forest, tundra and ice.
- **Volcanoes:** an island arc in the open sea.
- **Wetlands:** where the big river of Norvane reaches the gulf.
- **People:** mild lowlands near coasts and rivers, far more in the north, and very few in desert, tundra, ice and peaks. In dry lands people follow the rivers. A few giant cities, more mid-sized ones and many small ones. Coastal cities have harbours, and towns gather around cities.
- **Cultures:** each area builds in its own style, loosely inspired by real traditions: old-world spires, Mediterranean white and terracotta, northern onion domes, North American towers, Latin American colour, desert domes and minarets, pink-stone palaces, Central Asian turquoise domes, East Asian pagodas and canal towns.

## Regions and maps

These are proposed names and places. None of them is a playable course yet.

| Region | Biome | Where | Maps |
| --- | --- | --- | --- |
| Frostreach | Polar and alpine | The great range of Aurelia | Frostbite Falls, Glacier Glide, Aurora Ridge, Summit Drift |
| Evergreen Vale | Temperate forest | Western Aurelia, facing the westerlies | Maple Hollow, Mossy Mill, Fernwood Bend, Bramble Bridge |
| Sunspire Sands | Desert | Northern Kesh, under the dry belt | Dune Crossing, Mirage Mesa, Oasis Run, Canyon Echo |
| Palm Reef | Tropical | Equatorial Sudara | Coral Cove, Lagoon Loop, Jungle Vines, Mango Falls |
| Mirewater | Wetlands | The gulf delta of Norvane | Lily Pad Lane, Mangrove Maze, Foggy Bayou, Reed Rapids |
| Emberfall Isles | Volcanic | Island arc east of Aurelia | Cinder Steps, Magma Run, Ashen Caldera, Obsidian Edge |

## Sizes on the globe

The planet's radius is 100 units. On a 1280-wide screen one unit is about 6 pixels at the horizon. Everything is exaggerated so it can be seen, but keeps a sensible order. `loading.citySize` scales the buildings together. The numbers are in `SIZES` in `src/render/planet-scene.js`, and `tests/ui.test.cjs` checks the order from the real models.

| Object | Rough height or length | Height above ground |
| --- | --- | --- |
| Tree | 1 tall | ground |
| House, hut | 1 to 2 tall | ground |
| Windmill, turbine | 3 to 5 tall | ground |
| Lighthouse | 6 tall | ground |
| Ship | 3 to 5 long | sea level |
| Map flag | 3 tall | ground |
| City | 7 to 13 tall by rank, 7 to 12 across | ground |
| Mountain | 4 to 13 tall | ground |
| Volcano | 7 to 9 tall, 13 to 18 across | ground |
| Balloon | 3 tall | 11 |
| Cloud | 8 to 20 wide | 15 to 21, thin ones 31 to 36 |
| Plane | 5 long | 24 to 27 |
| Satellite | 4 wide | 46 and up |

The heights are layers, so nothing passes through anything else. Planes and satellites fly parallel lanes the same way at the same speed, so their paths never cross; balloons hang still over open country; sea routes never touch.

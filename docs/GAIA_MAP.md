# Map of Gaia

Gaia is the owner's own world, made in Azgaar's Fantasy Map Generator and imported with `node tools/gaia/import-azgaar.mjs "<file.map>"` into `src/shared/gaia-reference.js` (generated; edit the map in Azgaar and import again). The map must cover the whole globe, so its x is longitude and its y latitude. Everything reads that one file:

- **Flat map:** `src/render/reference-map.js` paints it in the comic look: smoothed biome areas with clean edges, an inked coast and lakes, rivers that widen toward the sea, high ground as grey rock and snow with a darker-grey edge, and basalt round the Emberfall volcanoes. `?art` on the dev server shows it on its own, with the regions and course pins (Pins toggle). Name tags are laid out so none collide (`src/render/map-labels.js`).
- **Globe:** `src/render/planet-data.js` builds the main-menu planet from the same coast, lakes, heights, biomes and rivers, in the flat map's colours. Cities are the map's capitals (three great, six large, the rest smaller); towns and villages are its other towns, largest first, kept off ice, peaks, lava, desert and marsh. Plants follow the biomes.
- **Level select:** `src/render/atlas-scene.js` lays the flat map on the reference coast in 3D, with the globe's towns, plants and volcanoes on it (`src/ui/WorldSelect.jsx`); `?map` goes straight to it. Without WebGL the plain course list shows.

## Regions and courses

Each region's caption point and course sites are hand-placed on the map in `src/shared/gaia-reference-regions.js` (map pixels); `src/shared/gaia-map.js` turns them into globe positions. `REGION_COURSES` places the 22 real courses, one site each, and picking one casts the normal vote. Site names are proposals.

| Region | Biome | Where | Sites |
| --- | --- | --- | --- |
| Frostreach | Polar and alpine | Snow and rock of the great eastern range | Frostbite Falls, Glacier Glide, Aurora Ridge, Summit Drift |
| Evergreen Vale | Temperate forest | The forest belt across the north of the western continent | Maple Hollow, Mossy Mill, Fernwood Bend, Bramble Bridge |
| Sunspire Sands | Desert | The dry savanna heart of the western continent | Dune Crossing, Mirage Mesa, Oasis Run |
| Palm Reef | Tropical | The forested island in the central sea | Coral Cove, Lagoon Loop, Jungle Vines, Mango Falls |
| Mirewater | Wetlands | The marsh peninsula at the far east | Lily Pad Lane, Mangrove Maze, Foggy Bayou, Reed Rapids |
| Emberfall Isles | Volcanic | The southern island chain, three volcanoes | Cinder Steps, Magma Run, Ashen Caldera |

Cultures follow the land (`cultureAt` in `src/shared/gaia-map.js`): canal towns in the marshes, northern towns in the cold, desert and savanna styles in the dry lands, the old world and the Mediterranean in the west, carnival colour on the middle islands, and palaces, the silk road and eastern towns in the east.

## Sizes on the globe

The planet's radius is 100 units. On a 1280-wide screen one unit is about 6 pixels at the horizon. Everything is exaggerated so it can be seen, but keeps a sensible order: buildings below the mountains, but not dwarfed by them. In the level select the same order holds, with cities about 2 to 3.4 tall beside volcanoes up to 4.4. `loading.citySize` scales the buildings together. The numbers are in `SIZES` in `src/render/planet-scene.js`, and `tests/ui.test.cjs` checks the order from the real models.

| Object | Rough height or length | Height above ground |
| --- | --- | --- |
| Tree | 1 tall | ground |
| House, hut | 1 to 2 tall | ground |
| Windmill, turbine | 3 to 5 tall | ground |
| Lighthouse | 5 tall | ground |
| Ship | 3 to 5 long | sea level |
| Map flag | 3 tall | ground |
| City | 3.4 to 5.7 tall by rank, the same whatever the building style, so every skyline stays below the mountains | ground |
| Mountain | 5 to 13 tall (median 7), never wider at the foot than its land | ground |
| Volcano | up to 9 tall, sized to stay on its island | ground |
| Balloon | 3 tall | 11 |
| Cloud | 8 to 20 wide | 15 to 21, thin ones 31 to 36 |
| Plane | 5 long | 24 to 27 |
| Satellite | 4 wide | 46 and up |

The heights are layers, so nothing passes through anything else. Planes and satellites fly parallel lanes the same way at the same speed, so their paths never cross; balloons hang still over open country; sea routes never touch.

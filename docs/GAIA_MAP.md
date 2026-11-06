# Map of Gaia

The six regions from the vision, with four maps each. The data lives in `src/shared/gaia-map.js`; the planet on the loading screen is built from it, so the globe and any flat map always match. Each map has a small flag on the globe. Open the flat version with `?map` on the dev server.

These are proposed names and places. None of them is a playable course yet.

| Region | Biome | Where | Maps |
| --- | --- | --- | --- |
| Frostreach | Polar and alpine | Far north of the eastern continent | Frostbite Falls, Glacier Glide, Aurora Ridge, Summit Drift |
| Evergreen Vale | Temperate forest | Western continent, mid north | Maple Hollow, Mossy Mill, Fernwood Bend, Bramble Bridge |
| Sunspire Sands | Desert | South of the central continent | Dune Crossing, Mirage Mesa, Oasis Run, Canyon Echo |
| Palm Reef | Tropical | Equatorial coast below the Vale | Coral Cove, Lagoon Loop, Jungle Vines, Mango Falls |
| Mirewater | Wetlands | North-east of the central continent | Lily Pad Lane, Mangrove Maze, Foggy Bayou, Reed Rapids |
| Emberfall Isles | Volcanic | Islands in the open sea | Cinder Steps, Magma Run, Ashen Caldera, Obsidian Edge |

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
| City | 12 tall, 9 across | ground |
| Mountain | up to 14 tall | ground |
| Volcano | 10 tall, 25 across | ground |
| Balloon | 3 tall | 5 to 7 |
| Cloud | 8 to 20 wide | 3 to 12, thin ones to 26 |
| Plane | 5 long | 13 to 17 |
| Satellite | 4 wide | 30 to 50 |

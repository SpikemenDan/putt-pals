/**
 * How many maps (courses) the game ships: the one bound that network messages, room records and deployables use to validate a map index.
 * It must equal the number of course definitions in src/courses (tests/courses.test.cjs checks that). Kept in its own module, outside the
 * simulation's import closure, so the wire contracts can read it without importing course data. Changing it is a protocol change: bump
 * PROTOCOL_VERSION and SERVER_ROOM_VERSION with it (docs/GITHUB_WORKFLOW.md).
 */
export const MAP_COUNT = 24;

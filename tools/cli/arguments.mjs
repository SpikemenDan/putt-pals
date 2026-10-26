/** Parse the shared course-file option without consuming command-specific values. */
export function parseCliArguments(argv) {
  let courseFile;
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--courses') {
      if (courseFile !== undefined) throw new Error('--courses may only be supplied once');
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('--courses requires a JSON file path');
      courseFile = value;
    } else if (arg.startsWith('--') && arg !== '--full') {
      throw new Error(`Unknown option: ${arg}`);
    } else positional.push(arg);
  }
  const [command, ...args] = positional;
  if (courseFile !== undefined && !['list', 'check', 'export', 'shot', 'solve'].includes(command)) {
    throw new Error('--courses is supported by list, check, export, shot and solve');
  }
  const arities = { list: [0], check: [0], export: [0], validate: [0], rank: [0], shot: [4], solve: [2, 3] };
  if (Object.hasOwn(arities, command) && !arities[command].includes(args.length)) throw new Error(`Invalid arguments for ${command}; see usage`);
  return { command, args, courseFile };
}

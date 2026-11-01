import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function previewConfiguration({ accountId, workersSubdomain, maintenance = false }, root = projectRoot) {
  if (typeof maintenance !== 'boolean') throw new Error('maintenance must be a boolean');
  if (typeof accountId !== 'string' || !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Provide a 32-character hexadecimal Cloudflare account ID');
  if (typeof workersSubdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workersSubdomain)) throw new Error('Provide the approved workers.dev subdomain label, without a URL or dots');
  const base = JSON.parse(readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  const name = 'putt-pals-rooms-preview';
  const origin = `https://${name}.${workersSubdomain}.workers.dev`;
  return {
    name, account_id: accountId.toLowerCase(), workers_dev: true, preview_urls: false,
    main: path.join(root, maintenance ? 'services/rooms/preview-maintenance.mjs' : base.main), compatibility_date: base.compatibility_date,
    assets: { ...base.env.preview.assets, directory: path.join(root, base.env.preview.assets.directory) },
    durable_objects: structuredClone(base.env.preview.durable_objects),
    exports: structuredClone(base.env.preview.exports),
    vars: { ROOM_ENVIRONMENT: 'preview', ROOM_ALLOWED_ORIGINS: origin },
    observability: { enabled: false },
  };
}

function prepare(args) {
  const values = {}; let replace = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--replace') { replace = true; continue; }
    if (args[i] === '--maintenance') { values.maintenance = true; continue; }
    const key = { '--account-id': 'accountId', '--workers-subdomain': 'workersSubdomain' }[args[i]];
    if (!key || values[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: node scripts/prepare-cloudflare-preview.mjs --account-id ID --workers-subdomain LABEL [--maintenance] [--replace]');
    values[key] = args[++i];
  }
  const config = previewConfiguration(values);
  const destination = path.join(projectRoot, `.wrangler/deploy/preview${values.maintenance ? '-maintenance' : ''}.json`);
  const output = JSON.stringify(config, null, 2) + '\n';
  mkdirSync(path.dirname(destination), { recursive: true });
  if (existsSync(destination) && !replace && readFileSync(destination, 'utf8') !== output) throw new Error('A different preview config exists; review it before using --replace');
  writeFileSync(destination, output);
  console.log(`Prepared locally: ${destination}\nWorker: ${config.name}\nOrigin: ${config.vars.ROOM_ALLOWED_ORIGINS}\nAccount: ${config.account_id}\nNo account connection, provisioning or deployment was performed. Separate approval is required.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { prepare(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

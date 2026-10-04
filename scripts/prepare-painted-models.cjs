// Package a verified base release plus game-composed finishes. No website or
// player data is copied. Run only after every required bake passes review.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: Object.fromEntries(['base-lock', 'base-models', 'painted', 'audit', 'game-exports', 'out'].map(key => [key, { type: 'string' }])) });
for (const key of ['base-lock', 'base-models', 'painted', 'audit', 'game-exports', 'out']) if (!values[key]) throw Error(`Missing --${key}`);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const base = readJson(values['base-lock']);
const audit = readJson(values.audit);
const output = path.resolve(values.out);
if (fs.existsSync(output)) throw Error('Choose a new output directory');
const files = new Map();
const models = {};
const previews = { ...base.paintPreviews };
const provenance = {};
const verifiedInputs = new Set();
function verify(name, data) {
  if (!/^[a-z0-9_]+\.glb$/.test(name) || data.length < 20 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw Error(`Invalid GLB ${name}`);
  const doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
  if (!doc.meshes?.length || doc.buffers.some(b => b.uri) || doc.images?.some(i => i.uri || !Number.isInteger(i.bufferView))) throw Error(`Incomplete or external GLB ${name}`);
  return doc;
}
for (const [name, info] of Object.entries(base.models)) {
  const data = fs.readFileSync(path.join(values['base-models'], name));
  verify(name, data);
  if (data.length !== info.bytes || hash(data) !== info.sha256) throw Error(`Base hash mismatch: ${name}`);
  files.set(name, data); models[name] = info;
}
for (const key of audit.missing) {
  if (previews[key]) continue; // Preserve the previously reviewed Aphrodite preview.
  const [weapon, paint] = key.split(':');
  if (!/^[a-z0-9_]+$/.test(weapon) || !/^[1-9][0-9]*$/.test(paint)) throw Error(`Invalid paint key ${key}`);
  const glove = !weapon.startsWith('weapon_');
  const name = `${weapon}_paint_${paint}.glb`;
  const report = readJson(path.join(values.painted, glove ? 'gloves-report.json' : `${weapon}-report.json`)).find(r => r.file === name);
  if (!report || !report.painted?.length || (!glove && report.basis !== 'source-inches-z-up-v1')) throw Error(`Unverified bake ${name}`);
  const data = fs.readFileSync(path.join(values.painted, name));
  const doc = verify(name, data);
  if (data.length !== report.bytes) throw Error(`Bake byte count mismatch: ${name}`);
  const metadata = doc.nodes?.find(n => n.extras?.preview === 'baked')?.extras;
  if (metadata?.weapon !== weapon || metadata.paint !== paint || metadata.game !== report.game || metadata.wear !== report.wear || metadata.seed !== report.seed) throw Error(`Bake metadata mismatch: ${name}`);
  const manifestPath = path.join(values['game-exports'], glove ? 'glove-game' : weapon === 'weapon_taser' ? 'taser-game' : `catalog-game/${weapon}`, 'manifest.json');
  const input = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(input);
  if (manifest.game !== report.game) throw Error(`Game input mismatch: ${name}`);
  if (!verifiedInputs.has(manifestPath)) {
    const root = path.resolve(path.dirname(manifestPath));
    for (const [relative, digest] of Object.entries(manifest.files)) {
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || hash(fs.readFileSync(file)) !== digest) throw Error(`Input integrity mismatch: ${relative}`);
    }
    verifiedInputs.add(manifestPath);
  }
  models[name] = { bytes: data.length, sha256: hash(data) };
  files.set(name, data);
  previews[key] = { model: name.slice(0, -4), seed: report.seed, wear: report.wear };
  provenance[name] = { game: report.game, weapon, paint, seed: report.seed, wear: report.wear, inputManifestSha256: hash(input), basis: metadata.basis, ...models[name] };
}
const tag = `models-v6-${hash(JSON.stringify({ models, previews })).slice(0, 12)}`;
const lock = { schema: 1, repository: base.repository, tag, models, paintPreviews: previews };
fs.mkdirSync(path.join(output, 'models'), { recursive: true });
for (const [name, data] of files) fs.writeFileSync(path.join(output, 'models', name), data, { flag: 'wx' });
fs.writeFileSync(path.join(output, 'website-model-lock-v6.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'paint-provenance-v6.json'), JSON.stringify({ schema: 1, tag, baseManifest: 'website-model-lock-v5.json', baseManifestSha256: hash(fs.readFileSync(values['base-lock'])), referenceCompositor: { repository: 'lukepolo/5stack-inventory-plugin', commit: 'fae818d02f41b83ac55a7b82a9098e665999c0a8' }, previews: provenance }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ tag, models: files.size, paints: Object.keys(previews).length, bytes: Object.values(models).reduce((n, m) => n + m.bytes, 0) }));

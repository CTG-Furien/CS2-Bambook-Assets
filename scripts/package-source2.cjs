const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: { source: { type: 'string' }, out: { type: 'string' } } });
if (!values.source || !values.out) throw Error('Required: --source and --out');
const source = path.resolve(values.source);
const out = path.resolve(values.out);
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (!/^\d+$/.test(manifest.game)) throw Error('Invalid game build');
fs.mkdirSync(out, { recursive: true });
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const artifacts = {};
for (const weapon of Object.keys(manifest.models)) {
  if (!/^weapon_[a-z0-9_]+$/.test(weapon)) throw Error('Unsafe weapon key');
  const files = Object.keys(manifest.files).filter(file => file.startsWith(`models/${weapon}/`));
  for (const file of files) {
    if (!/^models\/weapon_[a-z0-9_]+\/[a-zA-Z0-9_.-]+\.(png|glb)$/.test(file)) throw Error('Unsafe asset path');
    if (hash(fs.readFileSync(path.join(source, file))) !== manifest.files[file]) throw Error(`Invalid checksum: ${file}`);
  }
  const name = `cs2-${manifest.game}-${weapon}.tar`;
  const dest = path.join(out, name);
  if (fs.existsSync(dest)) throw Error(`Archive already exists: ${name}`);
  // Explicit members exclude .work, logs, and unrelated files.
  execFileSync('tar', ['-cf', dest, '-C', source, ...files], { windowsHide: true, stdio: 'pipe' });
  const data = fs.readFileSync(dest);
  if (data.length >= 2 ** 31) throw Error(`Archive exceeds GitHub release limit: ${name}`);
  artifacts[name] = { bytes: data.length, sha256: hash(data), files: files.length };
  console.log(`${name}: ${data.length} bytes, verified ${files.length} files`);
}
fs.writeFileSync(path.join(out, 'source2-packages.json'), JSON.stringify({ schema: 1, game: manifest.game, artifacts }, null, 2));

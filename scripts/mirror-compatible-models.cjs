// Freeze the viewer-compatible GLBs at a reviewed commit; verify Git blob IDs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: { tree: { type: 'string' }, out: { type: 'string' } } });
if (!values.tree || !values.out) throw Error('Required: --tree and --out');
const tree = JSON.parse(fs.readFileSync(values.tree, 'utf8'));
if (!/^[a-f0-9]{40}$/.test(tree.sha) || tree.truncated) throw Error('Invalid or truncated source tree');
const entries = tree.tree.filter(entry => /^src\/\[models\]\/[a-z0-9_]+\.glb$/.test(entry.path));
if (entries.length !== 65) throw Error(`Expected 65 models, found ${entries.length}`);
const out = path.resolve(values.out);
fs.mkdirSync(path.join(out, 'models'), { recursive: true });
const manifest = { schema: 1, format: 'viewer-compatible', source: { repository: 'LielXD/CS2-WeaponPaints-Website', commit: tree.sha }, files: {} };
const hash = (data, algorithm = 'sha256') => crypto.createHash(algorithm).update(data).digest('hex');
function verify(data, entry) {
  if (data.length !== entry.size || hash(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]), 'sha1') !== entry.sha) throw Error(`Source hash mismatch: ${entry.path}`);
  if (data.length < 20 || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) throw Error(`Invalid GLB: ${entry.path}`);
  const doc = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
  if (!doc.meshes?.length || [...(doc.images || []), ...(doc.buffers || [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw Error(`Non-self-contained GLB: ${entry.path}`);
}
async function download(entry) {
  const relative = 'models/' + path.posix.basename(entry.path);
  const dest = path.join(out, relative);
  let data = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
  if (!data) {
    const url = `https://raw.githubusercontent.com/${manifest.source.repository}/${tree.sha}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        data = Buffer.from(await response.arrayBuffer());
        verify(data, entry);
        fs.writeFileSync(dest, data);
        break;
      } catch (error) { if (attempt === 2) throw error; }
    }
  }
  verify(data, entry);
  manifest.files[relative] = { bytes: data.length, sha256: hash(data), gitBlob: entry.sha };
  console.log(`${relative}: verified`);
}
async function main() {
  for (let i = 0; i < entries.length; i += 4) await Promise.all(entries.slice(i, i + 4).map(download));
  manifest.files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Complete: ${entries.length} models, ${Object.values(manifest.files).reduce((sum, item) => sum + item.bytes, 0)} bytes`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

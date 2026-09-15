// Read installed CS2 assets; never modify the game or an existing published release.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: {
  tool: { type: 'string' }, vpk: { type: 'string' }, catalog: { type: 'string' }, out: { type: 'string' },
} });
for (const key of ['tool', 'vpk', 'catalog', 'out']) if (!values[key]) throw Error(`Missing --${key}`);
const tool = fs.realpathSync(values.tool);
const vpk = fs.realpathSync(values.vpk);
const out = path.resolve(values.out);
const inside = (parent, child) => {
  const rel = path.relative(parent, child);
  return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
};
if (inside(path.dirname(vpk), out) || inside(out, vpk)) throw Error('Output overlaps game installation');
if (fs.existsSync(path.join(out, 'manifest.json'))) throw Error('Release already exists; choose a fresh output');
const catalog = JSON.parse(fs.readFileSync(values.catalog, 'utf8'));
const game = fs.readFileSync(path.join(path.dirname(vpk), 'steam.inf'), 'utf8').match(/^ClientVersion=(.+)$/m)?.[1].trim();
if (!game) throw Error('Missing CS2 build number');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = { schema: 1, game, source: 'installed-cs2', rotationY: Math.PI / 2, models: {}, files: {} };
const work = path.join(out, '.work');
fs.mkdirSync(work, { recursive: true });
for (const [index, entry] of catalog.models.entries()) {
  const { weapon, model } = entry;
  if (!/^weapon_[a-z0-9_]+$/.test(weapon) || !/^weapons\/models\/[a-z0-9_/-]+\.vmdl_c$/.test(model)) throw Error('Unsafe catalog entry');
  const target = path.join(out, 'models', weapon);
  const marker = path.join(work, `${weapon}.json`);
  if (fs.existsSync(marker)) {
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (saved.game !== game || saved.source !== model) throw Error(`Stale export ${weapon}`);
    for (const [file, sha] of Object.entries(saved.files)) if (hash(fs.readFileSync(path.join(out, file))) !== sha) throw Error(`Corrupt existing file ${file}`);
    manifest.models[weapon] = saved.model;
    Object.assign(manifest.files, saved.files);
    console.log(`${index + 1}/${catalog.models.length} ${weapon}: verified existing export`);
    continue;
  }
  const raw = path.join(work, weapon);
  fs.mkdirSync(raw, { recursive: true });
  const stdout = fs.openSync(path.join(work, `${weapon}.stdout.log`), 'w');
  const stderr = fs.openSync(path.join(work, `${weapon}.stderr.log`), 'w');
  try {
    execFileSync(tool, ['-i', vpk, '-f', model, '-o', raw, '-d', '--gltf_export_format', 'glb', '--gltf_export_materials'], {
      stdio: ['ignore', stdout, stderr], windowsHide: true,
    });
  } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
  const source = path.join(raw, model.replace(/\.vmdl_c$/, '.glb'));
  const glb = fs.readFileSync(source);
  if (glb.length < 20 || glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length || glb.readUInt32LE(16) !== 0x4e4f534a) throw Error(`Invalid GLB: ${weapon}`);
  const doc = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  if (!doc.meshes?.length || doc.buffers?.some(buffer => buffer.uri)) throw Error(`Missing mesh or external buffer: ${weapon}`);
  fs.mkdirSync(target, { recursive: true });
  const files = {};
  function write(name, data) {
    fs.writeFileSync(path.join(target, name), data);
    files[`models/${weapon}/${name}`] = hash(data);
  }
  for (const image of doc.images || []) {
    if (!image.uri) continue;
    if (!/^[a-zA-Z0-9_.-]+\.png$/.test(image.uri)) throw Error(`Unsafe image in ${weapon}`);
    const data = fs.readFileSync(path.join(path.dirname(source), image.uri));
    if (!data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw Error(`Invalid PNG ${image.uri}`);
    write(image.uri, data);
  }
  write(`${weapon}.glb`, glb);
  const info = { file: `models/${weapon}/${weapon}.glb`, source: model, meshes: doc.meshes.map(mesh => mesh.name || ''), bytes: glb.length };
  manifest.models[weapon] = info;
  Object.assign(manifest.files, files);
  fs.writeFileSync(marker, JSON.stringify({ game, source: model, model: info, files }));
  console.log(`${index + 1}/${catalog.models.length} ${weapon}: ${Object.keys(files).length} verified files`);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Complete: ${Object.keys(manifest.models).length} models, ${Object.keys(manifest.files).length} files, CS2 ${game}`);

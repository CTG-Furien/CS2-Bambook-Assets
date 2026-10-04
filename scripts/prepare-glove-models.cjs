// Repackage the verified v2 bundle with catalog names for the actual glove meshes.
// No geometry, UVs, materials or embedded images are changed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: {
  lock: { type: 'string' }, source: { type: 'string' }, out: { type: 'string' },
} });
if (!values.lock || !values.source || !values.out) throw Error('Required: --lock --source --out');
const previous = JSON.parse(fs.readFileSync(values.lock, 'utf8'));
if (previous.tag !== 'models-v2-48010fcf7b7e') throw Error('Expected the reviewed v2 bundle');
const aliases = {
  '4725': 'studded_brokenfang_gloves', '5027': 'studded_bloodhound_gloves',
  '5030': 'sporty_gloves', '5031': 'slick_gloves', '5032': 'leather_handwraps',
  '5033': 'motorcycle_gloves', '5034': 'specialist_gloves', '5035': 'studded_hydra_gloves',
};
const output = path.resolve(values.out);
fs.mkdirSync(path.join(output, 'models'), { recursive: true });
const models = {};
const provenance = {};
for (const [name, info] of Object.entries(previous.models)) {
  // Despite their names these upstream files contain default knives, not gloves.
  if (name === 'gloves_ct.glb' || name === 'gloves_t.glb') continue;
  if (!/^[a-z0-9_]+\.glb$/.test(name)) throw Error('Invalid model name');
  const data = fs.readFileSync(path.join(values.source, name));
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (hash !== info.sha256 || data.length !== info.bytes || data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(8) !== data.length) throw Error(`Invalid model: ${name}`);
  const key = name.slice(0, -4);
  const target = `${aliases[key] || key}.glb`;
  if (aliases[key]) {
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
    if (!json.meshes?.some(mesh => /glove|handwrap/i.test(mesh.name)) || json.meshes.some(mesh => /knife/i.test(mesh.name))) throw Error(`Not a glove: ${name}`);
  }
  fs.writeFileSync(path.join(output, 'models', target), data, { flag: 'wx' });
  models[target] = info;
  provenance[target] = { release: previous.tag, file: name, ...info };
}
const tag = `models-v5-${crypto.createHash('sha256').update(JSON.stringify(models)).digest('hex').slice(0, 12)}`;
const lock = { ...previous, tag, models };
fs.writeFileSync(path.join(output, 'website-model-lock-v5.json'), JSON.stringify(lock, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(output, 'model-provenance-v5.json'), JSON.stringify({ schema: 1, tag, models: provenance }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ tag, models: Object.keys(models).length, gloves: Object.keys(aliases).length }));

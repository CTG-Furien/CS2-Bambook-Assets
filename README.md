# Bambook CS2 Assets

Versioned model bundles for Bambook. Binary files are attached to GitHub Releases;
they are not stored in this repository's Git history. No website source,
credentials, player information or server configuration belongs here.

## Bundles

- **Viewer-compatible models:** 65 GLBs (191,151,004 bytes), frozen from
  `LielXD/CS2-WeaponPaints-Website` commit
  `796b428de4be746058e636abd23ee5d9d14989e4`. Each download is verified against
  its Git blob hash and recorded with SHA-256. These preserve the UV layout and
  orientation expected by the existing website viewer. Individual GLBs are
  self-contained and are installed during the website's Docker build.
- **Source 2 models:** 55 weapon/knife exports from installed CS2 build
  **2000908**, with all 758 GLB/PNG files referenced by those exports. Per-weapon
  archives are for the upcoming compositor integration; their orientation and
  material layout differ from the viewer-compatible bundle.
- **Aphrodite prototype:** AK-47 paint 1397 and its material inputs from CS2
  build **2000905**. This is a separate experimental material bundle, not a
  complete paint library or a guarantee of exact in-game rendering.

The 55 Source 2 exports cover the website's weapon/knife catalog. The v5 base
manifest additionally exposes all eight compatible glove families by catalog name.
Base model availability does not mean every paint, sticker,
keychain, wear or seed can already be rendered. Applying inventory on the game
server is outside this asset repository's scope.

## Website consumption

The prepared v5 base manifest contains 64 self-contained GLBs: 55
weapon/knife bases (including Zeus x27), eight glove bases, and the Aphrodite
preview. The eight numeric glove files from v2 are renamed to their catalog
weapon keys without changing any bytes. Misleading upstream `gloves_ct` and
`gloves_t` files are excluded: they contain default knives, not glove meshes.
See `manifests/model-provenance-v5.json` for the exact source/hash mapping.

Reproduce with `node scripts/prepare-glove-models.cjs --lock
manifests/website-model-lock-v2.json --source <verified-v2-models-directory>
--out <new-directory>`. Existing tags and binary assets remain unchanged.
This intermediate manifest supplies base geometry and is consumed by v6 packaging.

Viewer bundle v6 adds 260 self-contained painted models from installed CS2 build
**2000924**, for a total of 324 GLBs. Together with the retained Aphrodite preview,
these cover all 261 finishes missing from the frozen upstream texture tree:
22 glove finishes and 239 weapon/knife finishes (including all four missing Zeus
finishes). The website's other paints retain their existing texture maps.
New previews use seed 1 and the finish's minimum wear, with embedded albedo,
roughness/metalness and normal textures up to 1024px. They preserve unpainted arms
and scopes. Fixed previews do not reproduce every wear, seed or Source 2 effect.

`scripts/prepare-painted-models.cjs` verifies every source manifest file, bake
metadata and output GLB before assembling the release. Supply `--base-lock`,
`--base-models`, `--painted`, `--audit`, `--game-exports` and a fresh `--out`.
The v6 provenance records game build, input-manifest hash, output SHA-256 and the
reference compositor revision. Weapon vertices are converted from VRF's glTF
metres into Source inches with a -90-degree X node rotation for the existing
viewer camera and lighting. The compatible glove geometry is retained unchanged.

Game material export follows the complete vcompmat/vmat resource graph. For
formats unsupported by Source 2 Viewer, the installed Valve resourceinfo utility
exports mip 0 to TGA for lossless PNG conversion. Baking is offline in Chromium
with Three.js and the referenced 5stack material compositor; its source is not
redistributed here. Never substitute a catalog thumbnail or a recolored base
model for a missing paint. Release GLBs contain their own embedded images.

Viewer bundle v2 adds an embedded **AK-47 Aphrodite (1397)** preview to the 65
unchanged compatible models. Its 7 MB GLB contains the HD model and all four PBR
images, composed from the published build-2000905 material prototype. Appearance
is fixed at seed 1 and wear 0.03; it is an approximate preview, not a full runtime
compositor. See `manifests/aphrodite-preview-v1.json` for provenance and checksum.

The website pins a release tag, expected byte sizes and SHA-256 hashes. Its build
downloads only the viewer-compatible GLBs, verifies every file, then serves
them under `/skin-assets/<release>/models/` on the website's own origin. Visitors
do not need GitHub authentication or cross-origin release downloads.

Do not move existing tags or overwrite released assets. Publish a new version
and update the website's lock file after validation. Keep older releases for
rollback. An unavailable/corrupt release must fail installation, not publish a
partial model set.

## Reproduction

`scripts/mirror-compatible-models.cjs --tree <source-tree.json> --out <directory>`
freezes the reviewed compatible models. `scripts/export-models.cjs --tool
<Source2Viewer-CLI.exe> --vpk <pak01_dir.vpk> --catalog <catalog.json> --out
<directory>` exports the installed game's models. Both scripts are run with Node.
Supply existing tools and game files; extraction never modifies the game.

Export `.work/` directories contain diagnostics and intermediate game files.
They must never be published. Release packaging uses explicit file allowlists.

## Attribution

Counter-Strike 2 models, textures, material data and trademarks belong to their
respective owners, including Valve. This project is not affiliated with Valve.
The viewer-compatible exports retain their upstream provenance. Publishing a
bundle does not change or grant rights in third-party assets. No upstream viewer
or compositor source is included in these binary bundles.

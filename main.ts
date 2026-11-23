// Velvet Tide: Port Solenne 3D — the hand-in program (Node 22, standard library
// only). The game itself is the game/ folder beside this file: plain static
// files a desktop browser plays offline, no build step and no network. This
// program exists to assemble the entry the grader receives and to leave an
// audit trail of that assembly:
//
//   1. stage game/ and screenshots/ into the output directory
//      (/output, or $MAKEFUN_OUTPUT_DIR when that is set),
//   2. write dossier.json there, built by the vendored make.fun library
//      under the scorer's own caps,
//   3. walk the finished output and record every file, with its size, in
//      entry-manifest.json — so what was handed in can be checked later
//      without opening the game or trusting this program's memory.
//
// To play locally instead: `node serve.ts`, then http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const ENTRY_TITLE = 'Velvet Tide: Port Solenne 3D';
const MANIFEST_NAME = 'entry-manifest.json';

// The caps the scorer enforces, restated here so the dossier written below is
// one the scorer accepts: at most 163,840 bytes of text, at most 4 screenshots
// of at most 262,144 bytes each, and a game tree of at most 993 files and
// 50,331,648 bytes with no single path over 1,000 bytes.
const SCORER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const entryDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function note(line) {
  console.log(`[entry] ${line}`);
}

/** "1234567" -> "1.18 MiB": sizes a human can sanity-check at a glance. */
function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * List every file under root as { path, bytes }, paths relative to root with
 * '/' separators, sorted so two runs over the same tree read identically.
 */
function surveyTree(root) {
  const found = [];
  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        found.push({ path: relative(root, full).split(sep).join('/'), bytes: statSync(full).size });
      }
    }
  };
  walk(root);
  return found;
}

/** Copy one entry folder (game/, screenshots/) into the output, and say what moved. */
function stageFolder(name, { required }) {
  const from = join(entryDir, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) {
    if (required) throw new Error(`entry is incomplete: ${name}/ is missing beside main.ts`);
    mkdirSync(to, { recursive: true });
    note(`${name}/: not present in the entry, staged as an empty folder`);
    return;
  }
  cpSync(from, to, { recursive: true });
  const files = surveyTree(to);
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  note(`${name}/: staged ${files.length} file(s), ${humanBytes(total)}`);
}

function assemble() {
  note(`assembling "${ENTRY_TITLE}" into ${outputDir}`);
  mkdirSync(outputDir, { recursive: true });

  stageFolder('game', { required: true });
  stageFolder('screenshots', { required: false });

  // The dossier is computed before the manifest exists, from exactly the tree
  // the scorer will read — the manifest must never feed back into it.
  const dossier = buildDossier(outputDir, SCORER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  note(`dossier.json: written, ${humanBytes(dossier.length)}`);

  // The manifest covers the whole output, dossier included, but never lists
  // itself: it is a record of the hand-in, not part of the game.
  const files = surveyTree(outputDir).filter((f) => f.path !== MANIFEST_NAME);
  const shots = files.filter((f) => f.path.startsWith('screenshots/'));
  const manifest = {
    title: ENTRY_TITLE,
    file_count: files.length,
    total_bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    screenshots: { count: shots.length, files: shots.map((f) => f.path) },
    files,
  };
  writeFileSync(join(outputDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
  note(`${MANIFEST_NAME}: ${files.length} file(s), ${humanBytes(manifest.total_bytes)} in total`);
  note('done');
}

assemble();

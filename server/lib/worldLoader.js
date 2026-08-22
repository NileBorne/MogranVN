const fs = require('fs');
const path = require('path');

const WORLDS_DIR = path.join(__dirname, '..', '..', 'user_data', 'worlds');
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

function listWorlds() {
  if (!fs.existsSync(WORLDS_DIR)) return [];
  return fs.readdirSync(WORLDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// A world's cover photo is just a file named "cover.*" sitting in the
// world's own folder (next to world.json) — same auto-detection idea as
// character emotions, no separate registration needed.
function findCoverFile(worldDir) {
  if (!fs.existsSync(worldDir)) return null;
  for (const file of fs.readdirSync(worldDir)) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) continue;
    if (path.basename(file, ext).toLowerCase() === 'cover') return file;
  }
  return null;
}

// Lightweight listing for the world-select screen — name, scenario blurb,
// and cover photo, without needing the full character/emotion scan.
function listWorldSummaries() {
  return listWorlds().map((name) => {
    const worldDir = path.join(WORLDS_DIR, name);
    let scenario = '';
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(worldDir, 'world.json'), 'utf-8'));
      scenario = manifest.scenario || '';
    } catch {
      // world.json missing or malformed — still list the folder, just blank
    }
    const coverFile = findCoverFile(worldDir);
    return {
      name,
      scenario,
      coverImage: coverFile ? `/media/${encodeURIComponent(name)}/${encodeURIComponent(coverFile)}` : null
    };
  });
}

// Reads world.json for the static stuff (names, descriptions) but always derives
// the *available emotions* from whatever image files actually exist on disk, so
// the model is never offered an expression there's no art for.
function loadWorld(worldName) {
  const worldDir = path.join(WORLDS_DIR, worldName);
  const manifestPath = path.join(worldDir, 'world.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }

  const charactersDir = path.join(worldDir, 'characters');
  const characters = {};

  for (const charName of Object.keys(manifest.characters || {})) {
    const charDef = manifest.characters[charName] || {};
    const charDir = path.join(charactersDir, charName);
    const emotionFiles = {};
    let portraitFile = null;

    if (fs.existsSync(charDir)) {
      for (const file of fs.readdirSync(charDir)) {
        const ext = path.extname(file).toLowerCase();
        if (!IMAGE_EXTS.includes(ext)) continue;
        const base = path.basename(file, ext).toLowerCase();
        // "portrait.*" is a reserved name: the fixed reference image shown
        // in the top frame, kept separate from the emotion set used for
        // the scene illustrations that accumulate in the log.
        if (base === 'portrait') {
          portraitFile = file;
          continue;
        }
        emotionFiles[base] = file;
      }
    }

    characters[charName] = {
      description: charDef.description || '',
      aliases: charDef.aliases || [],
      portraitFile,
      emotions: Object.keys(emotionFiles),
      emotionFiles
    };
  }

  return {
    name: manifest.name || worldName,
    scenario: manifest.scenario || '',
    coverImage: (() => {
      const coverFile = findCoverFile(worldDir);
      return coverFile ? `/media/${encodeURIComponent(worldName)}/${encodeURIComponent(coverFile)}` : null;
    })(),
    present: (manifest.present || Object.keys(characters)).filter((n) => characters[n]),
    lore: manifest.lore || [],
    intro: manifest.intro || '',
    styleNotes: manifest.styleNotes || '',
    characters
  };
}

// Builds the /media URL for a character's emotion image, falling back to that
// character's neutral image if the exact emotion isn't available.
function imageUrlFor(worldName, speaker, emotion, world) {
  const char = world.characters[speaker];
  if (!char) return null;
  const file = char.emotionFiles[emotion] || char.emotionFiles.neutral;
  if (!file) return null;
  return `/media/${encodeURIComponent(worldName)}/characters/${encodeURIComponent(speaker)}/${encodeURIComponent(file)}`;
}

module.exports = { listWorlds, listWorldSummaries, loadWorld, imageUrlFor, WORLDS_DIR };

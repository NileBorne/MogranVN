const fs = require('fs');
const path = require('path');
const { WORLDS_DIR } = require('./worldLoader');

function worldDir(worldName) {
  return path.join(WORLDS_DIR, worldName);
}

function manifestPath(worldName) {
  return path.join(worldDir(worldName), 'world.json');
}

function readManifest(worldName) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath(worldName), 'utf-8'));
  } catch {
    return null;
  }
}

function writeManifest(worldName, manifest) {
  fs.mkdirSync(worldDir(worldName), { recursive: true });
  fs.writeFileSync(manifestPath(worldName), JSON.stringify(manifest, null, 2));
}

function createWorld(name, scenario) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('World name is required');
  if (readManifest(trimmed)) throw new Error('A world with that name already exists');

  const manifest = { name: trimmed, scenario: (scenario || '').trim(), characters: {}, present: [], lore: [] };
  writeManifest(trimmed, manifest);
  fs.mkdirSync(path.join(worldDir(trimmed), 'characters'), { recursive: true });
  return manifest;
}

function updateWorldMeta(worldName, { name, scenario, intro, styleNotes, present } = {}) {
  const manifest = readManifest(worldName);
  if (!manifest) throw new Error('World not found');
  if (name !== undefined && name.trim()) manifest.name = name.trim();
  if (scenario !== undefined) manifest.scenario = scenario;
  if (intro !== undefined) manifest.intro = intro;
  if (styleNotes !== undefined) manifest.styleNotes = styleNotes;
  if (present !== undefined) manifest.present = present;
  writeManifest(worldName, manifest);
  return manifest;
}

function upsertCharacter(worldName, charName, { description, aliases, present } = {}) {
  const manifest = readManifest(worldName);
  if (!manifest) throw new Error('World not found');
  const trimmed = (charName || '').trim();
  if (!trimmed) throw new Error('Character name is required');

  manifest.characters = manifest.characters || {};
  const existing = manifest.characters[trimmed] || {};
  manifest.characters[trimmed] = {
    description: description !== undefined ? description : (existing.description || ''),
    aliases: aliases !== undefined
      ? aliases.filter(Boolean)
      : (existing.aliases || [])
  };

  manifest.present = manifest.present || [];
  if (present === true && !manifest.present.includes(trimmed)) manifest.present.push(trimmed);
  if (present === false) manifest.present = manifest.present.filter((n) => n !== trimmed);

  writeManifest(worldName, manifest);
  fs.mkdirSync(path.join(worldDir(worldName), 'characters', trimmed), { recursive: true });
  return manifest;
}

function deleteCharacter(worldName, charName) {
  const manifest = readManifest(worldName);
  if (!manifest) throw new Error('World not found');
  delete (manifest.characters || {})[charName];
  manifest.present = (manifest.present || []).filter((n) => n !== charName);
  writeManifest(worldName, manifest);
  return manifest;
}

function upsertLoreEntry(worldName, index, entry) {
  const manifest = readManifest(worldName);
  if (!manifest) throw new Error('World not found');
  manifest.lore = manifest.lore || [];

  const clean = {
    title: (entry.title || '').trim() || 'Lore',
    keys: Array.isArray(entry.keys) ? entry.keys.filter(Boolean) : [],
    content: (entry.content || '').trim(),
    alwaysOn: !!entry.alwaysOn
  };

  if (index === null || index === undefined || index < 0 || index >= manifest.lore.length) {
    manifest.lore.push(clean);
  } else {
    manifest.lore[index] = clean;
  }
  writeManifest(worldName, manifest);
  return manifest;
}

function deleteLoreEntry(worldName, index) {
  const manifest = readManifest(worldName);
  if (!manifest) throw new Error('World not found');
  manifest.lore = manifest.lore || [];
  manifest.lore.splice(index, 1);
  writeManifest(worldName, manifest);
  return manifest;
}

function characterImageDir(worldName, charName) {
  return path.join(worldDir(worldName), 'characters', charName);
}

// Removes whatever file currently represents this emotion (or "portrait"),
// regardless of extension — used both for an explicit delete and to clean
// up before a re-upload so changing an image never leaves an orphaned
// duplicate under a different extension.
function deleteCharacterImage(worldName, charName, emotion) {
  const dir = characterImageDir(worldName, charName);
  if (!fs.existsSync(dir)) return false;

  const target = (emotion || '').toLowerCase();
  let deleted = false;
  for (const file of fs.readdirSync(dir)) {
    const base = path.basename(file, path.extname(file)).toLowerCase();
    if (base === target) {
      fs.unlinkSync(path.join(dir, file));
      deleted = true;
    }
  }
  return deleted;
}

function coverImageDest(worldName) {
  return worldDir(worldName);
}

function deleteCharacterImage(worldName, charName, emotion) {
  const dir = characterImageDir(worldName, charName);
  const target = (emotion || '').trim().toLowerCase();
  if (!target) throw new Error('Emotion name is required');
  let deleted = 0;
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const ext = path.extname(file).toLowerCase();
      if (path.basename(file, ext).toLowerCase() === target) {
        fs.unlinkSync(path.join(dir, file));
        deleted++;
      }
    }
  }
  return deleted;
}

function deleteCoverImage(worldName) {
  const dir = coverImageDest(worldName);
  let deleted = 0;
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const ext = path.extname(file).toLowerCase();
      if (path.basename(file, ext).toLowerCase() === 'cover') {
        fs.unlinkSync(path.join(dir, file));
        deleted++;
      }
    }
  }
  return deleted;
}

module.exports = {
  createWorld,
  updateWorldMeta,
  upsertCharacter,
  deleteCharacter,
  upsertLoreEntry,
  deleteLoreEntry,
  deleteCharacterImage,
  deleteCoverImage,
  characterImageDir,
  coverImageDest,
  readManifest
};

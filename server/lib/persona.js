const fs = require('fs');
const path = require('path');

const PERSONA_DIR = path.join(__dirname, '..', '..', 'user_data', 'persona');
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

// Same reserved-filename auto-detection pattern as world covers and
// character portraits — drop in "avatar.<ext>", no registration needed.
function findAvatarFile() {
  if (!fs.existsSync(PERSONA_DIR)) return null;
  for (const file of fs.readdirSync(PERSONA_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) continue;
    if (path.basename(file, ext).toLowerCase() === 'avatar') return file;
  }
  return null;
}

function avatarUrl() {
  const file = findAvatarFile();
  return file ? `/persona-media/${encodeURIComponent(file)}` : null;
}

function deleteAvatar() {
  const file = findAvatarFile();
  if (file) fs.unlinkSync(path.join(PERSONA_DIR, file));
  return !!file;
}

module.exports = { PERSONA_DIR, findAvatarFile, avatarUrl, deleteAvatar };

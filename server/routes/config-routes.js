const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { loadConfig, saveConfig } = require('../config');
const serverControl = require('../lib/serverControl');
const persona = require('../lib/persona');

router.get('/', (req, res) => {
  res.json({ ...loadConfig(), avatarUrl: persona.avatarUrl() });
});

// Asks the LLM server what models it has available, so the settings UI can
// offer a dropdown instead of requiring the exact model name to be typed.
// Not every local server supports this — fail soft with an empty list.
router.get('/models', async (req, res) => {
  const config = loadConfig();
  try {
    const url = `${config.llmBaseUrl.replace(/\/$/, '')}/models`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = await r.json();
    const ids = (data.data || []).map((m) => m.id).filter(Boolean).sort();
    res.json({ models: ids });
  } catch (err) {
    res.status(502).json({ error: err.message, models: [] });
  }
});

router.put('/', (req, res) => {
  const { llmBaseUrl, llmModel, llmMaxTokens, maxTurnsPerReply, userName, userDescription, port } = req.body || {};
  const updates = {};

  if (llmBaseUrl) updates.llmBaseUrl = llmBaseUrl;
  if (llmModel) updates.llmModel = llmModel;
  if (llmMaxTokens !== undefined) {
    updates.llmMaxTokens = llmMaxTokens === null || llmMaxTokens === '' ? null : Number(llmMaxTokens);
  }
  if (maxTurnsPerReply) {
    updates.maxTurnsPerReply = Math.max(1, Math.min(5, Number(maxTurnsPerReply)));
  }
  if (userName !== undefined) updates.userName = userName;
  if (userDescription !== undefined) updates.userDescription = userDescription;
  if (port) updates.port = Number(port);

  const updated = saveConfig(updates);

  // Actually rebind the running server to the new port, rather than just
  // saving a value that only takes effect on next manual restart.
  if (updates.port) {
    serverControl.emit('change-port', updates.port);
  }

  res.json({ ...updated, avatarUrl: persona.avatarUrl() });
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(persona.PERSONA_DIR, { recursive: true });
      cb(null, persona.PERSONA_DIR);
    },
    filename: (req, file, cb) => {
      // Remove any existing avatar (regardless of extension) so re-uploading
      // replaces it instead of leaving an orphaned duplicate behind.
      if (fs.existsSync(persona.PERSONA_DIR)) {
        for (const existing of fs.readdirSync(persona.PERSONA_DIR)) {
          const ext = path.extname(existing).toLowerCase();
          if (path.basename(existing, ext).toLowerCase() === 'avatar') {
            fs.unlinkSync(path.join(persona.PERSONA_DIR, existing));
          }
        }
      }
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `avatar${ext}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.post('/persona-avatar', avatarUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({ ok: true, avatarUrl: persona.avatarUrl() });
});

router.delete('/persona-avatar', (req, res) => {
  persona.deleteAvatar();
  res.json({ ok: true });
});

module.exports = router;

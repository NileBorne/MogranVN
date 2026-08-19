const express = require('express');
const router = express.Router();
const { loadConfig, saveConfig } = require('../config');
const serverControl = require('../lib/serverControl');

router.get('/', (req, res) => {
  res.json(loadConfig());
});

// Asks the LLM server what models it has available, so the settings UI can
// offer a dropdown instead of requiring the exact model name to be typed.
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
  const {
    llmBaseUrl,
    llmModel,
    llmMaxTokens,
    maxTurnsPerReply,
    userName,
    userDescription,
    port,
  } = req.body || {};

  const updates = {};

  if (llmBaseUrl !== undefined) updates.llmBaseUrl = llmBaseUrl;
  if (llmModel !== undefined) updates.llmModel = llmModel;
  if (userName !== undefined) updates.userName = userName;
  if (userDescription !== undefined) updates.userDescription = userDescription;

  if (llmMaxTokens !== undefined) {
    updates.llmMaxTokens =
      llmMaxTokens === null || llmMaxTokens === '' ? null : Number(llmMaxTokens);
  }

  if (maxTurnsPerReply !== undefined) {
    updates.maxTurnsPerReply =
      maxTurnsPerReply === null || maxTurnsPerReply === ''
        ? 10
        : Number(maxTurnsPerReply);
  }

  if (port) updates.port = Number(port);

  const updated = saveConfig(updates);

  // Rebind the running server if port changed
  if (updates.port) {
    serverControl.emit('change-port', updates.port);
  }

  res.json(updated);
});

module.exports = router;
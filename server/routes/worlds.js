const express = require('express');
const router = express.Router();
const { listWorldSummaries, loadWorld } = require('../lib/worldLoader');
const { loadSession, saveSession } = require('../lib/sessionStore');
const { parseIntroToTurns } = require('../lib/introSeed');

router.get('/', (req, res) => {
  res.json({ worlds: listWorldSummaries() });
});

router.get('/:worldName', (req, res) => {
  const world = loadWorld(req.params.worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });
  res.json(world);
});

// Lets the browser restore the visible log after a page reload. If this is a
// brand-new session (no turns yet) and the world has an opening message, seed
// the session with it — once, so both the player sees it AND the model has
// it as real prior context on every future turn.
router.get('/:worldName/sessions/:sessionId', (req, res) => {
  const world = loadWorld(req.params.worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const session = loadSession(req.params.worldName, req.params.sessionId);

  if ((!session.turns || session.turns.length === 0) && world.intro && world.intro.trim()) {
    const introTurns = parseIntroToTurns(world, world.intro);
    if (introTurns.length) {
      session.turns = introTurns.map((t) => ({ role: 'assistant', speaker: t.speaker, emotion: t.emotion, text: t.text }));
      saveSession(req.params.worldName, req.params.sessionId, session);
    }
  }

  res.json({ turns: session.turns || [] });
});

// Edits a single turn's text in place — works for either a user message or
// one character's line from a multi-speaker reply. Speaker/emotion on an
// assistant turn are left alone; only the text changes.
router.put('/:worldName/sessions/:sessionId/turns/:index', (req, res) => {
  const world = loadWorld(req.params.worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const session = loadSession(req.params.worldName, req.params.sessionId);
  const idx = Number(req.params.index);
  if (!session.turns || !session.turns[idx]) return res.status(404).json({ error: 'Turn not found' });

  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text is required' });
  }

  session.turns[idx].text = text.trim();
  saveSession(req.params.worldName, req.params.sessionId, session);
  res.json({ ok: true, turns: session.turns });
});

// Removes a single turn outright (not just its text) — for cleaning up a
// bad exchange rather than editing it.
router.delete('/:worldName/sessions/:sessionId/turns/:index', (req, res) => {
  const world = loadWorld(req.params.worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const session = loadSession(req.params.worldName, req.params.sessionId);
  const idx = Number(req.params.index);
  if (!session.turns || !session.turns[idx]) return res.status(404).json({ error: 'Turn not found' });

  session.turns.splice(idx, 1);
  saveSession(req.params.worldName, req.params.sessionId, session);
  res.json({ ok: true, turns: session.turns });
});

module.exports = router;

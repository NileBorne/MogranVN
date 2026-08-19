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
      session.history = session.history || [];
      session.history.push({ role: 'assistant', content: world.intro.trim() });
      session.turns = introTurns.map((t) => ({ role: 'assistant', speaker: t.speaker, emotion: t.emotion, text: t.text }));
      saveSession(req.params.worldName, req.params.sessionId, session);
    }
  }

  res.json({ turns: session.turns || [] });
});

module.exports = router;

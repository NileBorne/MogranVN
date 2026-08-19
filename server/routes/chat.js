const express = require('express');
const router = express.Router();

const { loadWorld, imageUrlFor } = require('../lib/worldLoader');
const { buildSystemPrompt } = require('../lib/promptBuilder');
const { TurnStream } = require('../lib/turnParser');
const { streamChatCompletion } = require('../lib/llmClient');
const { loadSession, saveSession } = require('../lib/sessionStore');
const { loadConfig } = require('../config');
const { scanLorebook, formatLoreSection } = require('../lib/lorebook');

function send(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

router.post('/:worldName/chat', async (req, res) => {
  const { worldName } = req.params;
  const { sessionId, message } = req.body || {};

  if (!sessionId || !message || !message.trim()) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  const world = loadWorld(worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const session = loadSession(worldName, sessionId);
  session.history.push({ role: 'user', content: message.trim() });
  session.turns = session.turns || [];
  session.turns.push({ role: 'user', speaker: null, emotion: null, text: message.trim() });

  const presentNames = session.present || world.present;
  const config = loadConfig();
  const maxTurns = Math.max(1, Math.min(5, config.maxTurnsPerReply || 1));

  let systemPrompt = buildSystemPrompt(world, presentNames, maxTurns, {
    userName: config.userName,
    userDescription: config.userDescription
  });
  const recentText = session.history.slice(-8).map((m) => m.content).join('\n');
  systemPrompt += formatLoreSection(scanLorebook(world, presentNames, recentText));

  const messages = [{ role: 'system', content: systemPrompt }, ...session.history];

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const stream = new TurnStream(world, maxTurns);
  const completedTurns = [];
  let openTurn = null;
  let rawFull = '';

  const applyEvents = (events) => {
    for (const evt of events) {
      if (evt.type === 'meta') {
        if (openTurn) completedTurns.push(openTurn);
        openTurn = { speaker: evt.speaker, emotion: evt.emotion, text: '' };
        send(res, {
          type: 'meta',
          speaker: evt.speaker,
          emotion: evt.emotion,
          image: imageUrlFor(worldName, evt.speaker, evt.emotion, world)
        });
      } else if (evt.type === 'text') {
        if (!openTurn) openTurn = { speaker: 'Narrator', emotion: 'neutral', text: '' };
        openTurn.text += evt.delta;
        send(res, { type: 'text', delta: evt.delta });
      }
    }
  };

  try {
    await streamChatCompletion({
      baseUrl: config.llmBaseUrl,
      model: config.llmModel,
      maxTokens: config.llmMaxTokens,
      messages,
      onDelta: (chunk) => {
        rawFull += chunk;
        const { events, stop } = stream.push(chunk);
        applyEvents(events);
        if (stop) return false;
      }
    });
  } catch (err) {
    send(res, { type: 'error', message: err.message });
    return res.end();
  }

  applyEvents(stream.flush());
  if (openTurn) completedTurns.push(openTurn);

  if (completedTurns.length === 0) {
    completedTurns.push({ speaker: 'Narrator', emotion: 'neutral', text: '(no reply)' });
  }

  session.history.push({ role: 'assistant', content: rawFull });
  for (const t of completedTurns) {
    session.turns.push({ role: 'assistant', speaker: t.speaker, emotion: t.emotion, text: t.text.trim() });
  }
  saveSession(worldName, sessionId, session);

  send(res, { type: 'done' });
  res.end();
});

module.exports = router;

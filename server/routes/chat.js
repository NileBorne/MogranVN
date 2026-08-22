const express = require('express');
const router = express.Router();

const { loadWorld, imageUrlFor } = require('../lib/worldLoader');
const { buildSystemPrompt } = require('../lib/promptBuilder');
const { TurnStream } = require('../lib/turnParser');
const { streamChatCompletion } = require('../lib/llmClient');
const { loadSession, saveSession } = require('../lib/sessionStore');
const { loadConfig } = require('../config');
const { scanLorebook, formatLoreSection } = require('../lib/lorebook');
const { turnsToMessages } = require('../lib/turnsToMessages');
const { maybeSummarize } = require('../lib/summarizer');

function send(res, obj) {
  res.write(JSON.stringify(obj) + '\n');
}

function buildMessages(world, session, config) {
  const presentNames = session.present || world.present;
  const maxTurns = Math.max(1, Math.min(5, config.maxTurnsPerReply || 1));

  let systemPrompt = buildSystemPrompt(world, presentNames, maxTurns, {
    userName: config.userName,
    userDescription: config.userDescription
  });
  const recentText = (session.turns || []).slice(-8).map((t) => t.text).join('\n');
  systemPrompt += formatLoreSection(scanLorebook(world, presentNames, recentText));

  const messages = [{ role: 'system', content: systemPrompt }, ...turnsToMessages(session.turns)];
  return { messages, maxTurns };
}

// Shared by a normal reply and a regenerate: streams a reply for whatever
// messages array it's given, forwarding NDJSON events to the client as they
// resolve, and returns the completed turns once the stream ends (or null on
// a hard error, in which case an error event has already been sent).
async function generateReply(res, world, worldName, config, messages, maxTurns) {
  const stream = new TurnStream(world, maxTurns);
  const completedTurns = [];
  let openTurn = null;

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
        const { events, stop } = stream.push(chunk);
        applyEvents(events);
        if (stop) return false;
      }
    });
  } catch (err) {
    send(res, { type: 'error', message: err.message });
    return null;
  }

  applyEvents(stream.flush());
  if (openTurn) completedTurns.push(openTurn);
  if (completedTurns.length === 0) {
    completedTurns.push({ speaker: 'Narrator', emotion: 'neutral', text: '(no reply)' });
  }
  return completedTurns;
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
  session.turns = session.turns || [];
  session.turns.push({ role: 'user', speaker: null, emotion: null, text: message.trim() });

  const config = loadConfig();
  const { messages, maxTurns } = buildMessages(world, session, config);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const completedTurns = await generateReply(res, world, worldName, config, messages, maxTurns);
  if (!completedTurns) return res.end();

  for (const t of completedTurns) {
    session.turns.push({ role: 'assistant', speaker: t.speaker, emotion: t.emotion, text: t.text.trim() });
  }
  saveSession(worldName, sessionId, session);

  // Best-effort background memory compression — never awaited on the
  // critical path, and internally swallows its own errors.
  maybeSummarize({ world, worldName, sessionId, session, config }).catch(() => {});

  send(res, { type: 'done' });
  res.end();
});

// Drops the most recent reply (all consecutive assistant turns at the end)
// and generates a fresh one for the same last user message.
router.post('/:worldName/regenerate', async (req, res) => {
  const { worldName } = req.params;
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const world = loadWorld(worldName);
  if (!world) return res.status(404).json({ error: 'World not found' });

  const session = loadSession(worldName, sessionId);
  session.turns = session.turns || [];

  while (session.turns.length && session.turns[session.turns.length - 1].role === 'assistant') {
    session.turns.pop();
  }
  if (!session.turns.length || session.turns[session.turns.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Nothing to regenerate yet' });
  }

  const config = loadConfig();
  const { messages, maxTurns } = buildMessages(world, session, config);

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  const completedTurns = await generateReply(res, world, worldName, config, messages, maxTurns);
  if (!completedTurns) return res.end();

  for (const t of completedTurns) {
    session.turns.push({ role: 'assistant', speaker: t.speaker, emotion: t.emotion, text: t.text.trim() });
  }
  saveSession(worldName, sessionId, session);

  send(res, { type: 'done' });
  res.end();
});

module.exports = router;

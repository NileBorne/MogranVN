const { streamChatCompletion } = require('./llmClient');
const { readManifest, upsertLoreEntry } = require('./worldWriter');
const { saveSession } = require('./sessionStore');

const SUMMARIZE_EVERY = 12; // new turns since the last summary before triggering again
const KEEP_RECENT = 6;      // never summarize the most recent turns — they're still directly relevant
const SUMMARY_LORE_TITLE = 'Story so far (auto-summary)';

// Best-effort background compression: takes the turns about to age out of
// easy relevance, asks the model to fold them into a running summary, and
// keeps that summary as ONE lore entry that gets replaced (not appended)
// each time — so it stays a bounded, always-current digest instead of a
// pile of separate summaries that grows forever.
//
// This writes to the WORLD's lore, which is shared across every session in
// that world — the trade-off is that if you run two separate playthroughs
// of the same world, they'll share (and overwrite) one "story so far".
// Fine for the common case of one ongoing story per world; worth knowing
// if you ever want multiple parallel playthroughs of the same cast.
async function maybeSummarize({ world, worldName, sessionId, session, config }) {
  session.summaryState = session.summaryState || { lastSummarizedCount: 0 };
  const turns = session.turns || [];
  const newSinceLastSummary = turns.length - session.summaryState.lastSummarizedCount;

  if (newSinceLastSummary < SUMMARIZE_EVERY) return false;

  const summarizeEnd = Math.max(0, turns.length - KEEP_RECENT);
  const toSummarize = turns.slice(session.summaryState.lastSummarizedCount, summarizeEnd);
  if (!toSummarize.length) return false;

  const manifest = readManifest(worldName);
  if (!manifest) return false;
  const existingIndex = (manifest.lore || []).findIndex((e) => e.title === SUMMARY_LORE_TITLE);
  const previousSummary = existingIndex >= 0 ? manifest.lore[existingIndex].content : '';

  const transcript = toSummarize
    .map((t) => (t.role === 'user' ? `Player: ${t.text}` : `${t.speaker || 'Narrator'}: ${t.text}`))
    .join('\n');

  const prompt = [
    previousSummary
      ? `Here is the story summary so far:\n${previousSummary}\n\nHere is what happened next:`
      : 'Here is what happened in this scene:',
    transcript,
    'Write an updated, concise summary (one short paragraph) covering everything important up to this point, including what just happened. Focus on plot developments, decisions made, and changes to relationships or character state. Skip minor dialogue detail. Write it as plain narration, no tags, no dialogue quotes.'
  ].join('\n\n');

  let summary = '';
  try {
    await streamChatCompletion({
      baseUrl: config.llmBaseUrl,
      model: config.llmModel,
      maxTokens: 400,
      messages: [{ role: 'user', content: prompt }],
      onDelta: (chunk) => {
        summary += chunk;
      }
    });
  } catch {
    return false; // summarization is a nice-to-have — never let it break the main chat flow
  }

  summary = summary.trim();
  if (!summary) return false;

  upsertLoreEntry(worldName, existingIndex >= 0 ? existingIndex : null, {
    title: SUMMARY_LORE_TITLE,
    keys: [],
    content: summary,
    alwaysOn: true
  });

  session.summaryState.lastSummarizedCount = summarizeEnd;
  saveSession(worldName, sessionId, session);
  return true;
}

module.exports = { maybeSummarize, SUMMARY_LORE_TITLE };

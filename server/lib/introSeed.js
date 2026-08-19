const { TurnStream } = require('./turnParser');

// A world's intro is written in the exact same [Name|emotion] format as a
// live reply — this just runs it through the same parser all at once
// instead of streaming it token by token.
function parseIntroToTurns(world, introText) {
  if (!introText || !introText.trim()) return [];

  const stream = new TurnStream(world, 5);
  const { events } = stream.push(introText);
  const events2 = stream.flush();
  const all = [...events, ...events2];

  const turns = [];
  let current = null;
  for (const e of all) {
    if (e.type === 'meta') {
      if (current) turns.push(current);
      current = { speaker: e.speaker, emotion: e.emotion, text: '' };
    } else if (e.type === 'text') {
      if (!current) current = { speaker: 'Narrator', emotion: 'neutral', text: '' };
      current.text += e.delta;
    }
  }
  if (current) turns.push(current);

  return turns.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text);
}

module.exports = { parseIntroToTurns };

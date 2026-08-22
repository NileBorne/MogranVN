// session.turns is the single source of truth for a session — both what's
// displayed AND what the model sees. This reconstructs the messages array
// the LLM expects from it, grouping consecutive assistant turns (a
// multi-character reply) back into one message in the same [Name|emotion]
// format the model was taught to produce, so edits/regenerates/deletes to
// turns are automatically reflected next time without a second copy to
// keep in sync.
function turnsToMessages(turns) {
  const messages = [];
  let pending = null; // array of assistant turns waiting to be flushed together

  const flush = () => {
    if (!pending || !pending.length) return;
    const content = pending
      .map((t) => `[${t.speaker || 'Narrator'}|${t.emotion || 'neutral'}]\n${t.text}`)
      .join('\n\n');
    messages.push({ role: 'assistant', content });
    pending = null;
  };

  for (const turn of turns || []) {
    if (turn.role === 'user') {
      flush();
      messages.push({ role: 'user', content: turn.text });
    } else {
      pending = pending || [];
      pending.push(turn);
    }
  }
  flush();

  return messages;
}

module.exports = { turnsToMessages };

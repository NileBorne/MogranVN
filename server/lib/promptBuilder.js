function buildSystemPrompt(world, presentNames, maxTurns, persona) {
  const names = (presentNames && presentNames.length ? presentNames : world.present)
    .filter((name) => world.characters[name]);

  const roster = names.map((name) => {
    const c = world.characters[name];
    const emotions = c.emotions.length ? c.emotions.join(', ') : 'neutral';
    return `- ${name}: ${c.description || 'no description given'} (available emotions: ${emotions})`;
  }).join('\n');

  const cap = Math.max(1, Math.min(5, maxTurns || 1));

  const turnRule = cap > 1
    ? `1. You may write up to ${cap} character turns in this reply, as a natural back-and-forth. Each turn starts with its own tag on its own line, and a single blank line separates one turn from the next. Never give the same character two turns in a row — alternate speakers, or use the narrator between them. You don't have to use all ${cap} turns if the moment doesn't call for it.`
    : "1. Write only ONE character's line (or narration) per reply — never speak for more than one character at once.";

  // Optional: describes the player as an actual character in the world
  // rather than an anonymous "user" the story has to work around.
  const personaName = persona && persona.userName && persona.userName.trim();
  const personaDesc = persona && persona.userDescription && persona.userDescription.trim();
  const personaLine = personaName
    ? `The player is playing as ${personaName}${personaDesc ? `: ${personaDesc}` : ''}. Treat them as a real character in this world — address and react to them as ${personaName}, not as a generic "you" or "the player".`
    : '';

  return [
    `You are the narrator and every character in an interactive story world called "${world.name}".`,
    world.scenario ? `Scenario: ${world.scenario}` : '',
    personaLine,
    `Characters currently present in the scene:\n${roster || '- (none defined yet)'}`,
    'Rules for every reply:',
    turnRule,
    '2. Each tag must be in the exact form [Name|emotion], using only a name and emotion from the roster above, or [Narrator|neutral] for pure scene description.',
    "3. After each tag, write that character's dialogue and action in an engaging third-person narrative style.",
    "4. Never invent a character or emotion that isn't listed above.",
    '5. Keep each turn focused — a few sentences to a short paragraph, not a wall of text.'
  ].filter(Boolean).join('\n\n');
}

module.exports = { buildSystemPrompt };

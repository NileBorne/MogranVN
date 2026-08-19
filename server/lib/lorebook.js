
const MAX_MATCHES = 6;        // cap how many entries can be injected in one turn
const MAX_ENTRY_CHARS = 400;  // trim any single entry so it can't crowd out the rest

function normalize(str) {
  return (str || '').toLowerCase();
}

function keysFor(name, aliases) {
  return [name, ...(aliases || [])].filter(Boolean).map(normalize);
}

function matchesAny(keys, haystack) {
  return keys.some((k) => k && haystack.includes(k));
}

/**
 * @param {object} world        A world object as returned by worldLoader.loadWorld()
 * @param {string[]} presentNames  Characters already active in the scene (skipped —
 *                                  they're already fully described elsewhere)
 * @param {string} recentText    Recent conversation text to scan for mentions
 * @returns {{title: string, content: string}[]} matched entries, most-relevant first
 */
function scanLorebook(world, presentNames, recentText) {
  const haystack = normalize(recentText);
  const present = new Set(presentNames || []);
  const matched = [];

  for (const [name, char] of Object.entries(world.characters || {})) {
    if (present.has(name)) continue;
    const keys = keysFor(name, char.aliases);
    if (matchesAny(keys, haystack)) {
      matched.push({ title: name, content: (char.description || '').slice(0, MAX_ENTRY_CHARS) });
    }
  }

  for (const entry of world.lore || []) {
    if (!entry || !entry.content) continue;
    const keys = (entry.keys || []).map(normalize);
    if (entry.alwaysOn || matchesAny(keys, haystack)) {
      matched.push({ title: entry.title || 'Lore', content: entry.content.slice(0, MAX_ENTRY_CHARS) });
    }
  }

  return matched.slice(0, MAX_MATCHES);
}

/**
 * Turns matches into a text block ready to append to a system prompt.
 * Returns '' when there's nothing to add, so it's always safe to append.
 */
function formatLoreSection(matches) {
  if (!matches.length) return '';
  const lines = matches.map((m) => `- ${m.title}: ${m.content}`).join('\n');
  return `\n\nRelevant background (mentioned or otherwise relevant right now):\n${lines}\n\nYou may reference these in narration, but only characters in the roster above may be given a [Name|emotion] speaking tag.`;
}

module.exports = { scanLorebook, formatLoreSection };
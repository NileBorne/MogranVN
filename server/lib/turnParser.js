// Parses one or more [Speaker|emotion] segments out of a streaming reply, so
// a single model turn can hold a short back-and-forth between characters
// instead of being locked to one speaker.
//
// Segments are separated by a blank line before the next tag — that's a
// deliberate, easy-to-spot boundary that keeps this a simple string scan
// instead of needing real structured output support from the model.

const TAG_RE = /^\[([^|\]]+)\|([^\]]+)\]\n?/;
const MAX_TAG_BUFFER = 120;       // give up waiting for a well-formed tag after this many chars
const SEGMENT_BOUNDARY = '\n\n['; // blank line + bracket = "a new speaker is starting"

class TurnStream {
  constructor(world, maxTurns) {
    this.world = world;
    this.maxTurns = Math.max(1, Math.min(5, maxTurns || 1));
    this.buffer = '';
    this.segmentCount = 0;
    this.active = false;
    this.justOpened = false; // true right after a tag, until we've handled its trailing newline
    this.stopped = false;
  }

  push(chunk) {
    const events = [];
    if (this.stopped) return { events, stop: true };

    this.buffer += chunk;

    let progressed = true;
    while (progressed) {
      progressed = false;

      if (!this.active) {
        if (this._tryOpenSegment(events, false)) progressed = true;
        continue;
      }

      // A tag may have been matched before its trailing newline had even
      // arrived yet (chunk boundaries are arbitrary) — in that case the
      // newline shows up as the first character of the *next* push() call.
      // Trim exactly one of those so it never leaks into the visible text.
      if (this.justOpened) {
        if (this.buffer.length === 0) break; // can't decide yet, wait for more
        if (this.buffer[0] === '\n') this.buffer = this.buffer.slice(1);
        this.justOpened = false;
        progressed = true;
        continue;
      }

      const idx = this.buffer.indexOf(SEGMENT_BOUNDARY);
      if (idx === -1) {
        const safeLen = Math.max(0, this.buffer.length - SEGMENT_BOUNDARY.length);
        if (safeLen > 0) {
          events.push({ type: 'text', delta: this.buffer.slice(0, safeLen) });
          this.buffer = this.buffer.slice(safeLen);
        }
      } else {
        if (idx > 0) events.push({ type: 'text', delta: this.buffer.slice(0, idx) });
        this.buffer = this.buffer.slice(idx + 2); // drop the two newlines, keep the '['
        this.active = false;

        if (this.segmentCount >= this.maxTurns) {
          this.stopped = true;
          return { events, stop: true };
        }
        progressed = true;
      }
    }

    return { events, stop: false };
  }

  // Call once the upstream response has ended naturally, to flush whatever
  // was still being held back as "maybe a boundary is forming".
  flush() {
    const events = [];
    if (!this.active) this._tryOpenSegment(events, true);
    if (this.active && this.justOpened && this.buffer[0] === '\n') {
      this.buffer = this.buffer.slice(1);
      this.justOpened = false;
    }
    if (this.buffer) {
      events.push({ type: 'text', delta: this.buffer });
      this.buffer = '';
    }
    return events;
  }

  _tryOpenSegment(events, force) {
    if (this.buffer.length === 0) return false;

    if (this.buffer[0] !== '[') {
      this._openAs('Narrator', 'neutral', events);
      return true;
    }

    const m = this.buffer.match(TAG_RE);
    if (m) {
      const rawSpeaker = m[1].trim();
      let emotion = m[2].trim().toLowerCase();
      this.buffer = this.buffer.slice(m[0].length);

      const char = this.world.characters[rawSpeaker];
      if (!char) {
        this._openAs('Narrator', 'neutral', events);
      } else {
        if (!char.emotions.includes(emotion)) {
          emotion = char.emotions.includes('neutral') ? 'neutral' : (char.emotions[0] || 'neutral');
        }
        this._openAs(rawSpeaker, emotion, events);
      }
      return true;
    }

    if (force || this.buffer.length > MAX_TAG_BUFFER) {
      this._openAs('Narrator', 'neutral', events);
      return true;
    }

    return false;
  }

  _openAs(speaker, emotion, events) {
    this.active = true;
    this.justOpened = true;
    this.segmentCount++;
    events.push({ type: 'meta', speaker, emotion });
  }
}

module.exports = { TurnStream };

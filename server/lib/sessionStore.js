const fs = require('fs');
const path = require('path');
const { WORLDS_DIR } = require('./worldLoader');

function sessionsDir(worldName) {
  return path.join(WORLDS_DIR, worldName, 'sessions');
}

function sessionPath(worldName, sessionId) {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(sessionsDir(worldName), `${safeId || 'default'}.json`);
}

function loadSession(worldName, sessionId) {
  try {
    return JSON.parse(fs.readFileSync(sessionPath(worldName, sessionId), 'utf-8'));
  } catch {
    return { history: [], turns: [] };
  }
}

function saveSession(worldName, sessionId, session) {
  const dir = sessionsDir(worldName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(sessionPath(worldName, sessionId), JSON.stringify(session, null, 2));
}

module.exports = { loadSession, saveSession };

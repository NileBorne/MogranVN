const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'user_data', 'config.json');

const DEFAULTS = {
  llmBaseUrl: 'http://localhost:11434/v1',
  llmModel: 'llama3.1',
  llmMaxTokens: 300,
  maxTurnsPerReply: 2,
  userName: '',
  userDescription: '',
  port: 5173
};

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
}

function saveConfig(partial) {
  const current = loadConfig();
  const merged = { ...current, ...partial };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH };

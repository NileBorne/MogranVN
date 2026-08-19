const express = require('express');
const path = require('path');

const { WORLDS_DIR } = require('./lib/worldLoader');
const { PERSONA_DIR } = require('./lib/persona');
const { loadConfig } = require('./config');
const serverControl = require('./lib/serverControl');
const worldsRouter = require('./routes/worlds');
const chatRouter = require('./routes/chat');
const configRouter = require('./routes/config');
const creatorRouter = require('./routes/creator');


const app = express();
app.use(express.json());

// Character art is served straight out of user_data — nothing leaves the machine.
// Local dev tool, files change constantly — never let the browser cache a
// stale version of the app shell or character art behind our backs.
const noCache = { etag: false, lastModified: false, setHeaders: (res) => res.setHeader('Cache-Control', 'no-store') };
app.use('/media', express.static(WORLDS_DIR, noCache));
app.use('/persona-media', express.static(PERSONA_DIR, noCache));
app.use(express.static(path.join(__dirname, '..', 'public'), noCache));

app.use('/api/worlds', worldsRouter);
app.use('/api/worlds', chatRouter);
app.use('/api/config', configRouter);
app.use('/api/creator', creatorRouter);

const initialConfig = loadConfig();

let httpServer = app.listen(initialConfig.port, () => {
  console.log(`MorganVN is running at http://localhost:${initialConfig.port}`);
  console.log(`LLM endpoint: ${initialConfig.llmBaseUrl} (model: ${initialConfig.llmModel})`);
});

// Lets the settings UI change the port without requiring a manual restart:
// close the current listener, then open a new one on the requested port.
serverControl.on('change-port', (newPort) => {
  const current = httpServer.address();
  if (!newPort || (current && newPort === current.port)) return;

  console.log(`Switching to port ${newPort}...`);
  httpServer.close(() => {
    httpServer = app.listen(newPort, () => {
      console.log(`MorganVN is now running at http://localhost:${newPort}`);
    });
    httpServer.on('error', (err) => {
      console.error(`Could not bind to port ${newPort}: ${err.message}`);
    });
  });
});
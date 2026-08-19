const { EventEmitter } = require('events');

// A single shared emitter: routes/config.js emits 'change-port' when the user
// saves a new port from the settings UI, and index.js listens for it to
// gracefully close the old listener and open a new one.
module.exports = new EventEmitter();

# MogranVN

A local, open-source AI novel/roleplay app. It runs entirely on your machine
against your own local LLM — no accounts, no cloud calls, no telemetry.

### ⚠️ WARNING: This interface was built using three unpaid AI coders and one extremely tired CS student who watched approximately 30 minutes of HTML, CSS, and JavaScript tutorials before performing extensive code surgery.

If you find something that looks like it was held together with duct tape, prayers, and !important, congratulations.

It probably was.

MorganVN is currently in alpha. Things may break. Things may behave strangely. Some code may cause experienced developers to stare silently at the screen for several minutes.

and yeah the steps were written by AI too. because i am a bit dyslexic and english is not my first language . 

## What's here (Step 1 of the build)

This is the core engine: a world with a cast of characters, pre-made portraits
per emotion, and a chat loop where the model tags who's speaking and how they
feel so the right portrait shows automatically — no image generation involved,
just asset lookup.

A demo world ("Lumencia Academy") is included with placeholder art so you can
see the whole loop working before dropping in your own characters.

The **World Maker** (a UI for building worlds/characters and uploading art
without touching JSON) it's kinda bad but i am doing my best and will try to improve it .

## Setup

1. Install [Node.js](https://nodejs.org) 18 or newer.
2. Have a local LLM server running that exposes an OpenAI-compatible
   `/v1/chat/completions` endpoint. Easiest option is
   [Ollama](https://ollama.com):
   ```
   ollama pull llama3.1
   ollama serve
   ```
   LM Studio, llama.cpp's built-in server, and koboldcpp all work too — see
   "Configuring the LLM connection" below.
3. In this folder, install dependencies:
   ```
   npm install
   ```
4. Start the app:
   ```
   npm start
   ```
5. Open **http://localhost:5173** and pick "weird cafe" to try it out.

## Configuring the LLM connection

Click the gear icon in the top-right of the app, or edit
`user_data/config.json` directly:

```json
{
  "llmBaseUrl": "http://localhost:11434/v1",
  "llmModel": "llama3.1",
  "llmMaxTokens": 300,
  "port": 5173
}
```

This works with any local server that speaks the OpenAI chat-completions
format — just point `llmBaseUrl` at it. The model field offers a dropdown of
whatever your server reports having installed (via its `/models` endpoint);
if your server doesn't support that, just type the name.

- **Max reply length (tokens)** caps how long a single reply is allowed to
  run. Leave it blank to let the model use its own default.
- **App port** takes effect immediately — no manual restart needed. Saving a
  new port closes the old listener, opens the new one, and redirects your
  browser tab to it automatically.

## Building your own world

Worlds live in `user_data/worlds/<world name>/`:

```
user_data/worlds/My World/
  world.json
  characters/
    CharacterName/
      neutral.png
      happy.png
      angry.png          <- filename = emotion name, any image format works
```

`world.json`:

```json
{
  "name": "My World",
  "scenario": "One or two sentences setting the scene.",
  "characters": {
    "CharacterName": { "description": "Who they are, how they talk, what they look like." }
  },
  "present": ["CharacterName"]
}
```

The app scans each character's folder on every request and only ever asks the
model to use emotions you've actually supplied art for — drop a new image in
and it's usable immediately, no restart or code changes needed. `present`
controls who's in the scene by default; characters not listed there are
loaded but won't be brought up unless you edit it.

## How the portrait-matching works

Every reply from the model is required to start with a tag like
`[Lara|amused]` before the prose. The server:

1. Buffers just enough of the streamed reply to read that tag.
2. Looks up `characters/Lara/amused.png` (or whatever extension you used).
3. Sends the image to the browser immediately, then streams the rest of the
   reply as normal text right behind it.

If the model names a character or emotion that doesn't exist, it falls back
to that character's `neutral` image rather than breaking. If it forgets the
tag entirely, the line is shown as unattributed narration instead of being
dropped.

## Project layout

```
server/
  index.js            Express app entry point
  config.js            Reads/writes user_data/config.json
  lib/
    worldLoader.js      Scans user_data/worlds, builds character/emotion data
    llmClient.js         Streams from any OpenAI-compatible local LLM server
    turnParser.js         Parses the [Speaker|emotion] tag out of the stream
    promptBuilder.js       Builds the system prompt from a world's roster
    sessionStore.js         Reads/writes per-session chat history to disk
  routes/
    worlds.js           World listing/detail/session-restore endpoints
    chat.js               The streaming chat endpoint
    config.js               LLM connection settings endpoint
public/
  index.html          The whole UI: world select, story view, settings modal
  css/style.css         Styling
  js/app.js              All frontend logic, no build step, no framework
user_data/
  config.json         Your local LLM connection settings
  worlds/               Your worlds — this is the only folder you back up
```


## License

MIT — do whatever you want with it.
made by Borai Ibrahim from Nileborne 

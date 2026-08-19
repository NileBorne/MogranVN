(() => {
  const screenSelect = document.getElementById('screen-select');
  const screenStory = document.getElementById('screen-story');
  const worldList = document.getElementById('world-list');
  const worldTitle = document.getElementById('world-title');
  const portraitImg = document.getElementById('portrait-img');
  const nameplate = document.getElementById('nameplate');
  const log = document.getElementById('log');
  const composer = document.getElementById('composer');
  const inputMessage = document.getElementById('input-message');
  const btnSend = document.getElementById('btn-send');
  const btnBack = document.getElementById('btn-back');
  const btnSettings = document.getElementById('btn-settings');
  const btnSettingsOutside = document.getElementById('btn-settings-outside');
  const settingsModal = document.getElementById('settings-modal');
  const cfgBaseUrl = document.getElementById('cfg-base-url');
  const cfgModel = document.getElementById('cfg-model');
  const cfgMaxTokens = document.getElementById('cfg-max-tokens');
  const cfgMaxTurns = document.getElementById('cfg-max-turns');
  const cfgUserName = document.getElementById('cfg-user-name');
  const cfgUserDesc = document.getElementById('cfg-user-desc');
  const cfgUserAvatar = document.getElementById('cfg-user-avatar');
  const cfgAvatarPreview = document.getElementById('cfg-avatar-preview');  const cfgPort = document.getElementById('cfg-port');
  const cfgStatus = document.getElementById('cfg-status');
  const modelOptions = document.getElementById('model-options');
  const cfgCancel = document.getElementById('cfg-cancel');
  const cfgSave = document.getElementById('cfg-save');

  let currentWorldName = null;
  let currentWorldData = null;
  let currentSessionId = null;
  let sending = false;
  let currentSceneImage = null;
  let currentPortraitSpeaker = null;


  init();

  async function init() {
    await loadWorldList();
    btnBack.addEventListener('click', backToSelect);
    btnSettings.addEventListener('click', openSettings);
    if (btnSettingsOutside) btnSettingsOutside.addEventListener('click', openSettings);
    cfgCancel.addEventListener('click', closeSettings);
    cfgSave.addEventListener('click', saveSettings);
    cfgUserAvatar.addEventListener('change', uploadUserAvatar);
    composer.addEventListener('submit', onSubmit);
  }

  async function loadWorldList() {
    worldList.innerHTML = '';
    const res = await fetch('/api/worlds');
    const data = await res.json();

    if (!data.worlds.length) {
      worldList.innerHTML =
        '<p class="empty-state">No worlds yet. Add one under <code>user_data/worlds/</code> to get started &mdash; see the README.</p>';
      return;
    }

    for (const world of data.worlds) {
      const card = document.createElement('button');
      card.className = 'world-card';
      card.type = 'button';
      if (world.coverImage) {
        card.classList.add('has-cover');
        card.style.backgroundImage = `url(${world.coverImage})`;
      }
      card.innerHTML = '<h3></h3><p></p>';
      card.querySelector('h3').textContent = world.name;
      card.querySelector('p').textContent = world.scenario || 'Tap to step inside.';
      card.addEventListener('click', () => enterWorld(world.name));
      worldList.appendChild(card);
    }
  }

  async function enterWorld(name) {
    const res = await fetch(`/api/worlds/${encodeURIComponent(name)}`);
    if (!res.ok) return;
    currentWorldData = await res.json();
    currentWorldName = name;
    currentSessionId = getOrCreateSessionId(name);

    worldTitle.textContent = currentWorldData.name;
    screenSelect.classList.add('hidden');
    screenStory.classList.remove('hidden');
    log.innerHTML = '';
    currentSceneImage = null;
    currentPortraitSpeaker = null;
    portraitImg.removeAttribute('src');
    portraitImg.style.opacity = '0';
    nameplate.classList.add('hidden');

    await restoreHistory();
    inputMessage.focus();
  }

  function backToSelect() {
    screenStory.classList.add('hidden');
    screenSelect.classList.remove('hidden');
    currentWorldName = null;
    currentWorldData = null;
    currentSessionId = null;
  }

  function getOrCreateSessionId(worldName) {
    const key = `inkbound:session:${worldName}`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  async function restoreHistory() {
    const res = await fetch(
      `/api/worlds/${encodeURIComponent(currentWorldName)}/sessions/${encodeURIComponent(currentSessionId)}`
    );
    if (!res.ok) return;
    const data = await res.json();

    for (const turn of data.turns || []) {
      if (turn.role === 'user') {
        appendUserTurn(turn.text);
      } else {
        const turnDiv = appendAssistantTurn(turn.speaker, turn.text);
        setStage(turn.speaker, turn.emotion, turnDiv.sceneSlot);
      }
    }
    screenStory.scrollTop = screenStory.scrollHeight;
  }

  function setStage(speaker, emotion, slot) {
    updatePortrait(speaker);
    updateSceneArt(speaker, emotion, slot);

    if (speaker && speaker !== 'Narrator') {
      nameplate.textContent = speaker;
      nameplate.classList.remove('hidden');
    } else {
      nameplate.classList.add('hidden');
    }
  }

  // The top-frame portrait is a fixed reference image per character: it swaps
  // when a new character starts speaking, but never changes just because that
  // same character's emotion changes mid-scene. That's what the scene
  // illustrations below (in the log) are for.
  function updatePortrait(speaker) {
    if (speaker === currentPortraitSpeaker) return;
    const image = portraitUrlFor(speaker);

    portraitImg.style.opacity = '0';

    window.setTimeout(() => {
      if (image) {
        portraitImg.src = image;
        portraitImg.alt = speaker || '';
        portraitImg.style.opacity = '1';
      } else {
        portraitImg.removeAttribute('src');
        portraitImg.alt = '';
      }
    }, 120);

    currentPortraitSpeaker = speaker;
  }

  function updateSceneArt(speaker, emotion, slot) {
    const image = sceneImageUrlFor(speaker, emotion);

    // Only create a new illustration when the actual image changes, so the
    // log doesn't fill up with duplicate frames turn after turn.
    if (image && image !== currentSceneImage) {
      createSceneIllustration(image, speaker, emotion, slot);
      currentSceneImage = image;
    }
  }

  function createSceneIllustration(image, speaker, emotion, slot) {
    const scene = document.createElement('div');
    scene.className = 'scene-illustration';

    const img = document.createElement('img');
    img.src = image;
    img.alt = `${speaker || 'Scene'}, ${emotion || ''}`;
    img.loading = 'lazy';

    const fade = document.createElement('div');
    fade.className = 'scene-illustration-fade';

    const label = document.createElement('div');
    label.className = 'scene-illustration-label';

    if (speaker && speaker !== 'Narrator') {
      label.textContent = speaker;
    }

    scene.appendChild(img);
    scene.appendChild(fade);

    if (label.textContent) {
      scene.appendChild(label);
    }

    // Fall back to the end of the log if no slot was supplied.
    (slot || log).appendChild(scene);
  }

  // Fixed per-character reference image for the top portrait frame. Uses a
  // dedicated `portraitFile` on the character if the world data provides one;
  // otherwise falls back to their neutral emotion art so this works with no
  // world-data changes at all.
  function portraitUrlFor(speaker) {
    const char = currentWorldData && currentWorldData.characters && currentWorldData.characters[speaker];
    if (!char) return null;
    const file = char.portraitFile || (char.emotionFiles && char.emotionFiles.neutral);
    if (!file) return null;
    return `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(speaker)}/${encodeURIComponent(file)}`;
  }

  // Emotion-matched art for the scene illustrations that accumulate in the log.
  function sceneImageUrlFor(speaker, emotion) {
    const char = currentWorldData && currentWorldData.characters && currentWorldData.characters[speaker];
    if (!char) return null;
    const file = (char.emotionFiles && char.emotionFiles[emotion]) || (char.emotionFiles && char.emotionFiles.neutral);
    if (!file) return null;
    return `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(speaker)}/${encodeURIComponent(file)}`;
  }

  function appendUserTurn(text) {
    const div = document.createElement('div');
    div.className = 'turn user';
    const span = document.createElement('span');
    span.className = 'turn-text';
    span.textContent = text;
    div.appendChild(span);
    log.appendChild(div);
    return div;
  }

  function appendAssistantTurn(speaker, initialText) {
    const isNarrator = !speaker || speaker === 'Narrator';

    const wrapper = document.createElement('div');
    wrapper.className = 'assistant-block';

    const sceneSlot = document.createElement('div');
    sceneSlot.className = 'scene-slot';

    const div = document.createElement('div');
    div.className = 'turn' + (isNarrator ? ' narrator' : '');

    const speakerSpan = document.createElement('span');
    speakerSpan.className = 'turn-speaker';
    speakerSpan.textContent = isNarrator ? 'Narrator' : speaker;

    const textSpan = document.createElement('span');
    textSpan.className = 'turn-text';
    textSpan.textContent = initialText || '';

    div.appendChild(speakerSpan);
    div.appendChild(textSpan);

    wrapper.appendChild(sceneSlot);
    wrapper.appendChild(div);
    log.appendChild(wrapper);

    // This turn's own image slot, filled in later by setStage() once the
    // speaker/emotion for the reply is known — keeping the art above this text.
    div.sceneSlot = sceneSlot;
    return div;
  }

  function appendError(message) {
    const div = document.createElement('div');
    div.className = 'turn error';
    const span = document.createElement('span');
    span.className = 'turn-text';
    span.textContent = message;
    div.appendChild(span);
    log.appendChild(div);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const text = inputMessage.value.trim();
    if (!text) return;

    inputMessage.value = '';
    appendUserTurn(text);
    screenStory.scrollTop = screenStory.scrollHeight;

    sending = true;
    btnSend.disabled = true;
    composer.classList.add('sending');

    const assistantDiv = appendAssistantTurn('Narrator', '');
    let currentDiv = assistantDiv;
    let currentTextSpan = currentDiv.querySelector('.turn-text');
    let currentSpeakerSpan = currentDiv.querySelector('.turn-speaker');
    currentTextSpan.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    let started = false;
    screenStory.scrollTop = screenStory.scrollHeight;

    const handleEvent = (evt) => {
      if (evt.type === 'meta') {
        if (started) {
          // A different character is taking over — give them their own turn
          // block instead of overwriting whoever just finished speaking.
          currentDiv = appendAssistantTurn(evt.speaker, '');
          currentTextSpan = currentDiv.querySelector('.turn-text');
          currentSpeakerSpan = currentDiv.querySelector('.turn-speaker');
        } else {
          currentTextSpan.innerHTML = '';
          started = true;
        }
        const isNarrator = !evt.speaker || evt.speaker === 'Narrator';
        currentDiv.className = 'turn' + (isNarrator ? ' narrator' : '');
        currentSpeakerSpan.textContent = isNarrator ? 'Narrator' : evt.speaker;
        setStage(evt.speaker, evt.emotion, currentDiv.sceneSlot);
        screenStory.scrollTop = screenStory.scrollHeight;
      } else if (evt.type === 'text') {
        if (!started) { currentTextSpan.innerHTML = ''; started = true; }
        currentTextSpan.textContent += evt.delta;
        screenStory.scrollTop = screenStory.scrollHeight;
      } else if (evt.type === 'error') {
        if (!started) { currentTextSpan.innerHTML = ''; started = true; }
        appendError(evt.message);
      }
    };

    try {
      const res = await fetch(`/api/worlds/${encodeURIComponent(currentWorldName)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, message: text })
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        assistantDiv.parentElement.remove();
        appendError(errData.error || `Request failed (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let leftover = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = leftover + decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        leftover = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          handleEvent(evt);
        }
      }
    } catch (err) {
      if (!started) textSpan.innerHTML = '';
      appendError('Lost connection to the app server.');
    } finally {
      sending = false;
      btnSend.disabled = false;
      composer.classList.remove('sending');
      screenStory.scrollTop = screenStory.scrollHeight;
      inputMessage.focus();
    }
  }

  function openSettings() {
    cfgStatus.textContent = '';
    Promise.all([
      fetch('/api/config').then((r) => r.json()),
      fetch('/api/config/models').then((r) => r.json()).catch(() => ({ models: [] }))
    ]).then(([cfg, modelsData]) => {
      cfgBaseUrl.value = cfg.llmBaseUrl || '';
      cfgModel.value = cfg.llmModel || '';
      cfgMaxTokens.value = cfg.llmMaxTokens ?? '';
      cfgMaxTurns.value = cfg.maxTurnsPerReply || 1;
      cfgPort.value = cfg.port || '';
      cfgUserName.value = cfg.userName || '';
      cfgUserDesc.value = cfg.userDescription || '';
      renderAvatarPreview(cfg.avatarUrl);

      modelOptions.innerHTML = '';
      for (const id of modelsData.models || []) {
        const opt = document.createElement('option');
        opt.value = id;
        modelOptions.appendChild(opt);
      }

      settingsModal.classList.remove('hidden');
    });
  }

  function renderAvatarPreview(avatarUrl) {
    cfgAvatarPreview.innerHTML = '';
    if (!avatarUrl) return;
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = 'Your avatar';
    cfgAvatarPreview.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-secondary';
    removeBtn.textContent = 'Remove avatar';
    removeBtn.style.marginTop = '6px';
    removeBtn.addEventListener('click', async () => {
      await fetch('/api/config/persona-avatar', { method: 'DELETE' });
      renderAvatarPreview(null);
    });
    cfgAvatarPreview.appendChild(removeBtn);
  }

  async function uploadUserAvatar() {
    const file = cfgUserAvatar.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    const res = await fetch('/api/config/persona-avatar', { method: 'POST', body: form });
    cfgUserAvatar.value = '';
    if (res.ok) {
      const data = await res.json();
      renderAvatarPreview(data.avatarUrl);
    }
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

 async function saveSettings() {
    const previousPort = window.location.port ? parseInt(window.location.port, 10) : 80;
    const newPort = cfgPort.value ? parseInt(cfgPort.value, 10) : previousPort;

    const payload = {
      llmBaseUrl: cfgBaseUrl.value.trim(),
      llmModel: cfgModel.value.trim(),
      llmMaxTokens: cfgMaxTokens.value === '' ? null : Number(cfgMaxTokens.value),
      maxTurnsPerReply: Number(cfgMaxTurns.value) || 1,
      userName: cfgUserName.value.trim(),
      userDescription: cfgUserDesc.value.trim(),
      port: newPort
    };

    cfgSave.disabled = true;
    cfgStatus.textContent = "Saving..."; // Add a saving indicator
    cfgStatus.style.color = "var(--text)";

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // --- NEW ERROR CHECKING LOGIC ---
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server rejected save (${res.status})`);
      }

      // Only switch ports or close if the save was actually successful
      if (newPort && newPort !== previousPort) {
        cfgStatus.textContent = `Switching to port ${newPort}...`;
        cfgStatus.style.color = "var(--accent)";
        window.setTimeout(() => {
          window.location.href = `${window.location.protocol}//${window.location.hostname}:${newPort}`;
        }, 700);
      } else {
        closeSettings();
      }

    } catch (err) {
      // Display the error in the menu so you know what failed
      cfgStatus.textContent = err.message;
      cfgStatus.style.color = "var(--danger)"; 
    } finally {
      cfgSave.disabled = false;
    }
  }
})();

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
  const btnNewSession = document.getElementById('btn-new-session');
  const regenerateRow = document.getElementById('regenerate-row');
  const btnRegenerate = document.getElementById('btn-regenerate');
  const settingsModal = document.getElementById('settings-modal');
  const cfgBaseUrl = document.getElementById('cfg-base-url');
  const cfgModel = document.getElementById('cfg-model');
  const cfgMaxTokens = document.getElementById('cfg-max-tokens');
  const cfgMaxTurns = document.getElementById('cfg-max-turns');
  const cfgUserName = document.getElementById('cfg-user-name');
  const cfgUserDesc = document.getElementById('cfg-user-desc');
  const cfgUserAvatar = document.getElementById('cfg-user-avatar');
  const cfgAvatarPreview = document.getElementById('cfg-avatar-preview');
  const cfgPort = document.getElementById('cfg-port');
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
  let currentTurns = []; // mirrors the server's session.turns, used for edit prefill + regenerate

  init();

  async function init() {
    await loadWorldList();
    btnBack.addEventListener('click', backToSelect);
    btnSettings.addEventListener('click', openSettings);
    if (btnSettingsOutside) btnSettingsOutside.addEventListener('click', openSettings);
    if (btnNewSession) btnNewSession.addEventListener('click', startNewSession);
    if (btnRegenerate) btnRegenerate.addEventListener('click', regenerateLastReply);
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
        card.setAttribute('aria-label', world.name);
      } else {
        card.innerHTML = '<h3></h3><p></p>';
        card.querySelector('h3').textContent = world.name;
        card.querySelector('p').textContent = world.scenario || 'Tap to step inside.';
      }

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

    await reloadLog();
    inputMessage.focus();
  }

  function backToSelect() {
    screenStory.classList.add('hidden');
    screenSelect.classList.remove('hidden');
    currentWorldName = null;
    currentWorldData = null;
    currentSessionId = null;
    currentTurns = [];
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

  async function startNewSession() {
    if (!confirm('Start a new session? Your current conversation is kept on disk but won\u2019t show here anymore.')) return;
    const key = `inkbound:session:${currentWorldName}`;
    const newId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, newId);
    currentSessionId = newId;
    await reloadLog();
  }

  // The single source of truth for what's on screen: always re-fetches the
  // session and re-renders every turn from scratch. Used on entry and after
  // every mutation (send, regenerate, edit, delete) instead of trying to
  // patch the DOM incrementally — that would need perfectly-tracked indices
  // across every one of those operations, and getting that wrong silently
  // is worse than a harmless extra fetch on a local server.
  async function reloadLog() {
    try {
      const res = await fetch(
        `/api/worlds/${encodeURIComponent(currentWorldName)}/sessions/${encodeURIComponent(currentSessionId)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      renderFullLog(data.turns || []);
    } catch {
      // network hiccup — leave whatever's currently on screen as-is
    }
  }

  function renderFullLog(turns) {
    currentTurns = turns;
    log.innerHTML = '';
    currentSceneImage = null;
    currentPortraitSpeaker = null;
    portraitImg.removeAttribute('src');
    portraitImg.style.opacity = '0';
    nameplate.classList.add('hidden');

    turns.forEach((turn, index) => {
      if (turn.role === 'user') {
        appendUserTurn(turn.text, index);
      } else {
        const turnDiv = appendAssistantTurn(turn.speaker, turn.text, index);
        setStage(turn.speaker, turn.emotion, turnDiv.sceneSlot);
      }
    });

    updateRegenerateVisibility();
    screenStory.scrollTop = screenStory.scrollHeight;
  }

  function updateRegenerateVisibility() {
    if (!regenerateRow) return;
    const last = currentTurns[currentTurns.length - 1];
    const canRegenerate = last && last.role === 'assistant' && !sending;
    regenerateRow.classList.toggle('hidden', !canRegenerate);
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

    (slot || log).appendChild(scene);
  }

  function portraitUrlFor(speaker) {
    const char = currentWorldData && currentWorldData.characters && currentWorldData.characters[speaker];
    if (!char) return null;
    const file = char.portraitFile || (char.emotionFiles && char.emotionFiles.neutral);
    if (!file) return null;
    return `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(speaker)}/${encodeURIComponent(file)}`;
  }

  function sceneImageUrlFor(speaker, emotion) {
    const char = currentWorldData && currentWorldData.characters && currentWorldData.characters[speaker];
    if (!char) return null;
    const file = (char.emotionFiles && char.emotionFiles[emotion]) || (char.emotionFiles && char.emotionFiles.neutral);
    if (!file) return null;
    return `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(speaker)}/${encodeURIComponent(file)}`;
  }

  // index is optional — omitted while a reply is still streaming in (nothing
  // to edit/delete yet), present once rendered from a known session.turns
  // position (via reloadLog), which is when the action buttons appear.
  function appendUserTurn(text, index) {
    const div = document.createElement('div');
    div.className = 'turn user';
    const span = document.createElement('span');
    span.className = 'turn-text';
    span.textContent = text;
    div.appendChild(span);
    addTurnActions(div, index);
    log.appendChild(div);
    return div;
  }

  function appendAssistantTurn(speaker, initialText, index) {
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
    addTurnActions(div, index);

    wrapper.appendChild(sceneSlot);
    wrapper.appendChild(div);
    log.appendChild(wrapper);

    div.sceneSlot = sceneSlot;
    return div;
  }

 function addTurnActions(container, index) {
    if (typeof index !== 'number') return;

    const turn = currentTurns[index];
    const isLastTurn = index === currentTurns.length - 1;

    const actionsRow = document.createElement('div');
    actionsRow.className = 'message-actions-row';

    // Move Regenerate button next to 3 dots if it's the last assistant turn
    if (isLastTurn && turn && turn.role === 'assistant') {
      const regenBtn = document.createElement('button');
      regenBtn.type = 'button';
      regenBtn.className = 'msg-icon-btn';
      regenBtn.innerHTML = '&#8635;';
      regenBtn.setAttribute('aria-label', 'Regenerate response');
      regenBtn.addEventListener('click', () => regenerateLastReply());
      actionsRow.appendChild(regenBtn);
    }

    // 3-Dots Button
    const dotsBtn = document.createElement('button');
    dotsBtn.type = 'button';
    dotsBtn.className = 'msg-icon-btn';
    dotsBtn.innerHTML = '&#8942;';
    dotsBtn.setAttribute('aria-label', 'More options');

    // Dropdown Box
    const dropdown = document.createElement('div');
    dropdown.className = 'msg-dropdown hidden';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'msg-dropdown-item';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      editTurnAt(index, container);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'msg-dropdown-item';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      deleteTurnAt(index);
    });

    dotsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!actionsRow.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });

    dropdown.appendChild(editBtn);
    dropdown.appendChild(deleteBtn);
    actionsRow.appendChild(dotsBtn);
    actionsRow.appendChild(dropdown);

    container.appendChild(actionsRow);
  }

  async function editTurnAt(index, container) {
    const turn = currentTurns[index];
    if (!turn) return;

    const textSpan = container.querySelector('.turn-text');
    if (!textSpan) return;

    const originalText = textSpan.textContent;
    textSpan.style.display = 'none';

    const actionsRow = container.querySelector('.message-actions-row');
    if (actionsRow) actionsRow.style.display = 'none';

    // Bigger Edit Bubble Container
    const editorDiv = document.createElement('div');
    editorDiv.className = 'inline-edit-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'inline-edit-textarea';
    textarea.value = originalText;

    const btnRow = document.createElement('div');
    btnRow.className = 'inline-edit-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.type = 'button';
    saveBtn.className = 'send-btn';
    saveBtn.style.width = 'auto';
    saveBtn.style.padding = '0 18px';
    saveBtn.style.fontSize = '0.88rem';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    editorDiv.appendChild(textarea);
    editorDiv.appendChild(btnRow);
    container.appendChild(editorDiv);

    textarea.focus();

    const cleanup = () => {
      editorDiv.remove();
      textSpan.style.display = '';
      if (actionsRow) actionsRow.style.display = 'inline-flex';
    };

    cancelBtn.addEventListener('click', cleanup);

    saveBtn.addEventListener('click', async () => {
      const trimmed = textarea.value.trim();
      if (!trimmed || trimmed === turn.text) {
        cleanup();
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await fetch(
        `/api/worlds/${encodeURIComponent(currentWorldName)}/sessions/${encodeURIComponent(currentSessionId)}/turns/${index}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed })
        }
      );
      await reloadLog();
    });
  }


async function editTurnAt(index, container) {
    const turn = currentTurns[index];
    if (!turn) return;

    // Find the original text and hide it
    const textSpan = container.querySelector('.turn-text');
    if (!textSpan) return;
    
    const originalText = textSpan.textContent;
    textSpan.style.display = 'none';
    
    // Hide the 3-dots menu while editing
    const actionsRow = container.querySelector('.message-actions-row');
    if (actionsRow) actionsRow.style.display = 'none';

    // Create the inline editor box
    const editorDiv = document.createElement('div');
    editorDiv.style.width = '100%';
    editorDiv.style.marginTop = '8px';

    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.style.width = '100%';
    textarea.style.minHeight = '100px';
    textarea.style.background = '#202020';
    textarea.style.color = '#f2f2f2';
    textarea.style.border = '1px solid #414141';
    textarea.style.borderRadius = '10px';
    textarea.style.padding = '12px';
    textarea.style.fontFamily = 'inherit';
    textarea.style.fontSize = '0.95rem';
    textarea.style.marginBottom = '10px';
    textarea.style.resize = 'vertical';
    textarea.style.outline = 'none';

    // Focus style for textarea
    textarea.addEventListener('focus', () => textarea.style.borderColor = '#666');
    textarea.addEventListener('blur', () => textarea.style.borderColor = '#414141');

    // Create Save and Cancel buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.background = '#d7ff00';
    saveBtn.style.color = '#111';
    saveBtn.style.border = 'none';
    saveBtn.style.padding = '6px 16px';
    saveBtn.style.borderRadius = '8px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.style.fontWeight = 'bold';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.background = '#252525';
    cancelBtn.style.color = '#fff';
    cancelBtn.style.border = '1px solid #444';
    cancelBtn.style.padding = '6px 16px';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.style.cursor = 'pointer';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    editorDiv.appendChild(textarea);
    editorDiv.appendChild(btnRow);
    container.appendChild(editorDiv);
    
    // Auto-focus the textbox
    textarea.focus();

    // Cancel logic
    const cleanup = () => {
      editorDiv.remove();
      textSpan.style.display = '';
      if (actionsRow) actionsRow.style.display = 'flex';
    };
    cancelBtn.addEventListener('click', cleanup);

    // Save logic
    saveBtn.addEventListener('click', async () => {
      const trimmed = textarea.value.trim();
      if (!trimmed || trimmed === turn.text) {
        cleanup();
        return;
      }

      saveBtn.textContent = 'Saving...';
      saveBtn.disabled = true;

      await fetch(
        `/api/worlds/${encodeURIComponent(currentWorldName)}/sessions/${encodeURIComponent(currentSessionId)}/turns/${index}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed })
        }
      );
      await reloadLog();
    });
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

  // Shared by a normal send and a regenerate: streams NDJSON events from
  // `url` into fresh turn block(s) appended to the log live, then reloads
  // the log once the stream ends so indices/edit/delete stay correct.
  async function streamReplyInto(url, body) {
    sending = true;
    btnSend.disabled = true;
    composer.classList.add('sending');
    if (btnRegenerate) btnRegenerate.disabled = true;
    updateRegenerateVisibility();

    let currentDiv = appendAssistantTurn('Narrator', '');
    let currentTextSpan = currentDiv.querySelector('.turn-text');
    let currentSpeakerSpan = currentDiv.querySelector('.turn-speaker');
    currentTextSpan.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    let started = false;
    screenStory.scrollTop = screenStory.scrollHeight;

    const handleEvent = (evt) => {
      if (evt.type === 'meta') {
        if (started) {
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
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        currentDiv.parentElement.remove();
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
      appendError('Lost connection to the app server.');
    } finally {
      sending = false;
      btnSend.disabled = false;
      composer.classList.remove('sending');
      if (btnRegenerate) btnRegenerate.disabled = false;
      screenStory.scrollTop = screenStory.scrollHeight;
      await reloadLog(); // canonical state + working edit/delete on the new turns
      inputMessage.focus();
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (sending) return;
    const text = inputMessage.value.trim();
    if (!text) return;

    inputMessage.value = '';
    appendUserTurn(text);
    screenStory.scrollTop = screenStory.scrollHeight;

    await streamReplyInto(`/api/worlds/${encodeURIComponent(currentWorldName)}/chat`, {
      sessionId: currentSessionId,
      message: text
    });
  }

  async function regenerateLastReply() {
    if (sending) return;
    const last = currentTurns[currentTurns.length - 1];
    if (!last || last.role !== 'assistant') return;

    // Show the log up through the last user turn, dropping the reply we're
    // about to replace, before streaming the new one in.
    const trimmed = [...currentTurns];
    while (trimmed.length && trimmed[trimmed.length - 1].role === 'assistant') trimmed.pop();
    renderFullLog(trimmed);

    await streamReplyInto(`/api/worlds/${encodeURIComponent(currentWorldName)}/regenerate`, {
      sessionId: currentSessionId
    });
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
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } finally {
      cfgSave.disabled = false;
    }

    if (newPort && newPort !== previousPort) {
      cfgStatus.textContent = `Switching to port ${newPort}...`;
      window.setTimeout(() => {
        window.location.href = `${window.location.protocol}//${window.location.hostname}:${newPort}`;
      }, 700);
    } else {
      closeSettings();
    }
  }
})();

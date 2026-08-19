(() => {
  const worldPickerList = document.getElementById('world-picker-list');
  const btnNewWorld = document.getElementById('btn-new-world');
  const newWorldForm = document.getElementById('new-world-form');
  const nwName = document.getElementById('nw-name');
  const nwScenario = document.getElementById('nw-scenario');
  const nwCreate = document.getElementById('nw-create');
  const nwError = document.getElementById('nw-error');

  const emptyHint = document.getElementById('empty-hint');
  const worldEditor = document.getElementById('world-editor');

  const wName = document.getElementById('w-name');
  const wScenario = document.getElementById('w-scenario');
  const wIntro = document.getElementById('w-intro');
  const wSave = document.getElementById('w-save');
  const wStatus = document.getElementById('w-status');
  const wCoverFile = document.getElementById('w-cover-file');
  const wCoverPreview = document.getElementById('w-cover-preview');

  const characterList = document.getElementById('character-list');
  const cName = document.getElementById('c-name');
  const cDesc = document.getElementById('c-desc');
  const cAliases = document.getElementById('c-aliases');
  const cPresent = document.getElementById('c-present');
  const cAdd = document.getElementById('c-add');
  const cError = document.getElementById('c-error');

  const loreList = document.getElementById('lore-list');
  const lTitle = document.getElementById('l-title');
  const lKeys = document.getElementById('l-keys');
  const lContent = document.getElementById('l-content');
  const lAlways = document.getElementById('l-always');
  const lAdd = document.getElementById('l-add');
  const lError = document.getElementById('l-error');

  let currentWorldName = null;
  let currentWorldData = null;


  const tempSlider = document.getElementById('llm-temp');
  const tempVal = document.getElementById('temp-val');

  init();

  async function init() {
    await loadWorldPicker();

    btnNewWorld.addEventListener('click', () => {
      newWorldForm.classList.remove('hidden');
      worldEditor.classList.add('hidden');
      emptyHint.classList.add('hidden');
      nwName.focus();
    });

    nwCreate.addEventListener('click', createWorld);
    wSave.addEventListener('click', saveWorldMeta);
    wCoverFile.addEventListener('change', uploadCover);
    cAdd.addEventListener('click', addCharacter);
    lAdd.addEventListener('click', addLore);
  }

  async function loadWorldPicker() {
    const res = await fetch('/api/worlds');
    const data = await res.json();
    worldPickerList.innerHTML = '';

    for (const world of data.worlds || []) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'world-picker-item' + (world.name === currentWorldName ? ' active' : '');
      btn.textContent = world.name;
      btn.addEventListener('click', () => selectWorld(world.name));
      worldPickerList.appendChild(btn);
    }
  }


  if (tempSlider && tempVal) {
  tempSlider.addEventListener('input', (e) => {
    // Force 1 decimal place format for floats (e.g., "1.0" instead of "1")
    tempVal.textContent = parseFloat(e.target.value).toFixed(1);
  });
}

const tokensSlider = document.getElementById('llm-tokens');
const tokensVal = document.getElementById('tokens-val');

if (tokensSlider && tokensVal) {
  tokensSlider.addEventListener('input', (e) => {
    tokensVal.textContent = e.target.value;
  });
}

  async function createWorld() {
    nwError.textContent = '';
    const name = nwName.value.trim();
    if (!name) { nwError.textContent = 'Name is required.'; return; }

    const res = await fetch('/api/creator/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scenario: nwScenario.value.trim() })
    });
    const data = await res.json();
    if (!res.ok) { nwError.textContent = data.error || 'Could not create world.'; return; }

    nwName.value = '';
    nwScenario.value = '';
    newWorldForm.classList.add('hidden');
    await loadWorldPicker();
    selectWorld(data.name);
  }

  async function selectWorld(name) {
    const res = await fetch(`/api/worlds/${encodeURIComponent(name)}`);
    if (!res.ok) return;
    currentWorldData = await res.json();
    currentWorldName = name;

    newWorldForm.classList.add('hidden');
    emptyHint.classList.add('hidden');
    worldEditor.classList.remove('hidden');

    wName.value = currentWorldData.name;
    wScenario.value = currentWorldData.scenario || '';
    wIntro.value = currentWorldData.intro || '';
    wStatus.textContent = '';

    renderCoverPreview();
    renderCharacters();
    renderLore();
    highlightActiveWorld();
  }

  function highlightActiveWorld() {
    for (const btn of worldPickerList.querySelectorAll('.world-picker-item')) {
      btn.classList.toggle('active', btn.textContent === currentWorldName);
    }
  }

  function renderCoverPreview() {
    wCoverPreview.innerHTML = '';
    if (currentWorldData.coverImage) {
      const img = document.createElement('img');
      img.src = currentWorldData.coverImage;
      img.alt = 'Cover photo';
      wCoverPreview.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-secondary';
      removeBtn.textContent = 'Remove cover';
      removeBtn.style.marginTop = '6px';
      removeBtn.addEventListener('click', deleteCover);
      wCoverPreview.appendChild(removeBtn);
    }
  }

  async function deleteCover() {
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/cover`, { method: 'DELETE' });
    await refreshCurrentWorld();
  }

  async function saveWorldMeta() {
    wStatus.textContent = '';
    const res = await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wName.value.trim(), scenario: wScenario.value.trim(), intro: wIntro.value })
    });
    const data = await res.json();
    if (!res.ok) { wStatus.textContent = data.error || 'Could not save.'; return; }
    wStatus.textContent = 'Saved.';
    await loadWorldPicker();
    highlightActiveWorld();
  }

  async function uploadCover() {
    const file = wCoverFile.files[0];
    if (!file || !currentWorldName) return;

    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/cover`, {
      method: 'POST',
      body: form
    });
    wCoverFile.value = '';
    if (res.ok) await refreshCurrentWorld();
  }

  function renderCharacters() {
    characterList.innerHTML = '';
    const chars = currentWorldData.characters || {};
    const presentSet = new Set(currentWorldData.present || []);
    const names = Object.keys(chars);

    if (!names.length) {
      const p = document.createElement('p');
      p.className = 'character-desc';
      p.textContent = 'No characters yet.';
      characterList.appendChild(p);
    }

    for (const name of names) {
      const char = chars[name];
      const card = document.createElement('div');
      card.className = 'character-card';

      const head = document.createElement('div');
      head.className = 'character-card-head';

      const title = document.createElement('strong');
      title.textContent = name;

      const presentLabel = document.createElement('label');
      presentLabel.className = 'checkbox-label small';
      const presentCheckbox = document.createElement('input');
      presentCheckbox.type = 'checkbox';
      presentCheckbox.checked = presentSet.has(name);
      presentCheckbox.addEventListener('change', () => toggleCharacterPresent(name, presentCheckbox.checked));
      presentLabel.appendChild(presentCheckbox);
      presentLabel.appendChild(document.createTextNode(' Present'));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteCharacter(name));

      head.appendChild(title);
      head.appendChild(presentLabel);
      head.appendChild(deleteBtn);

      const desc = document.createElement('p');
      desc.className = 'character-desc';
      desc.textContent = char.description || '(no description)';

      // The reference portrait is a fixed image shown in the top frame
      // whenever this character is speaking — separate from the emotion set
      // below, which populates the illustrated scene log instead.
      const portraitSection = document.createElement('div');
      portraitSection.className = 'portrait-section';

      const portraitLabel = document.createElement('span');
      portraitLabel.className = 'field-label';
      portraitLabel.textContent = 'Reference portrait (top frame)';
      portraitSection.appendChild(portraitLabel);

      if (char.portraitFile) {
        const pThumb = document.createElement('div');
        pThumb.className = 'emotion-thumb';
        const pImg = document.createElement('img');
        pImg.src = `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(name)}/${encodeURIComponent(char.portraitFile)}`;
        pImg.alt = `${name} reference portrait`;
        const pDelete = document.createElement('button');
        pDelete.type = 'button';
        pDelete.className = 'thumb-delete';
        pDelete.textContent = '\u00d7';
        pDelete.setAttribute('aria-label', 'Delete reference portrait');
        pDelete.addEventListener('click', () => deleteCharacterImage(name, 'portrait'));
        pThumb.appendChild(pImg);
        pThumb.appendChild(pDelete);
        portraitSection.appendChild(pThumb);
      } else {
        const pNone = document.createElement('span');
        pNone.className = 'character-desc';
        pNone.textContent = 'None set — falls back to the neutral emotion image.';
        portraitSection.appendChild(pNone);
      }

      const portraitUploadRow = document.createElement('div');
      portraitUploadRow.className = 'emotion-upload';
      const portraitFileInput = document.createElement('input');
      portraitFileInput.type = 'file';
      portraitFileInput.accept = 'image/*';
      const portraitUploadBtn = document.createElement('button');
      portraitUploadBtn.type = 'button';
      portraitUploadBtn.className = 'btn-secondary';
      portraitUploadBtn.textContent = 'Upload reference portrait';
      portraitUploadBtn.addEventListener('click', () => uploadPortraitImage(name, portraitFileInput));
      portraitUploadRow.appendChild(portraitFileInput);
      portraitUploadRow.appendChild(portraitUploadBtn);
      portraitSection.appendChild(portraitUploadRow);

      const emotionLabel = document.createElement('span');
      emotionLabel.className = 'field-label';
      emotionLabel.textContent = 'Emotion portraits (scene log)';

      const thumbs = document.createElement('div');
      thumbs.className = 'emotion-thumbs';
      for (const emotion of char.emotions || []) {
        const wrap = document.createElement('div');
        wrap.className = 'emotion-thumb';
        const img = document.createElement('img');
        img.src = `/media/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(name)}/${encodeURIComponent(char.emotionFiles[emotion])}`;
        img.alt = emotion;
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'thumb-delete';
        deleteBtn.textContent = '\u00d7';
        deleteBtn.setAttribute('aria-label', `Delete ${emotion} portrait`);
        deleteBtn.addEventListener('click', () => deleteCharacterImage(name, emotion));
        const label = document.createElement('span');
        label.textContent = emotion;
        wrap.appendChild(img);
        wrap.appendChild(deleteBtn);
        wrap.appendChild(label);
        thumbs.appendChild(wrap);
      }
      if (!(char.emotions || []).length) {
        const none = document.createElement('span');
        none.className = 'character-desc';
        none.textContent = 'No portraits uploaded yet.';
        thumbs.appendChild(none);
      }

      const uploadRow = document.createElement('div');
      uploadRow.className = 'emotion-upload';
      const emotionInput = document.createElement('input');
      emotionInput.type = 'text';
      emotionInput.placeholder = 'emotion name (e.g. happy)';
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'btn-secondary';
      uploadBtn.textContent = 'Upload portrait';
      uploadBtn.addEventListener('click', () => uploadEmotionImage(name, emotionInput, fileInput));
      uploadRow.appendChild(emotionInput);
      uploadRow.appendChild(fileInput);
      uploadRow.appendChild(uploadBtn);

      card.appendChild(head);
      card.appendChild(desc);
      card.appendChild(portraitSection);
      card.appendChild(emotionLabel);
      card.appendChild(thumbs);
      card.appendChild(uploadRow);
      characterList.appendChild(card);
    }
  }

  async function toggleCharacterPresent(name, present) {
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ present })
    });
    await refreshCurrentWorld();
  }

  async function deleteCharacter(name) {
    if (!confirm(`Delete ${name}? This won't remove their uploaded image files.`)) return;
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });
    await refreshCurrentWorld();
  }

  async function addCharacter() {
    cError.textContent = '';
    const name = cName.value.trim();
    if (!name) { cError.textContent = 'Name is required.'; return; }
    const aliases = cAliases.value.split(',').map((s) => s.trim()).filter(Boolean);

    const res = await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: cDesc.value.trim(), aliases, present: cPresent.checked })
    });
    const data = await res.json();
    if (!res.ok) { cError.textContent = data.error || 'Could not add character.'; return; }

    cName.value = '';
    cDesc.value = '';
    cAliases.value = '';
    cPresent.checked = false;
    await refreshCurrentWorld();
  }

  async function uploadPortraitImage(charName, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    // Reuses the same emotion-image endpoint — "portrait" is a reserved
    // name worldLoader.js treats specially, keeping it out of the emotion
    // set entirely.
    const form = new FormData();
    form.append('emotion', 'portrait');
    form.append('image', file);
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(charName)}/image`, {
      method: 'POST',
      body: form
    });
    await refreshCurrentWorld();
  }

  async function deleteCharacterImage(charName, emotion) {
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(charName)}/image/${encodeURIComponent(emotion)}`, {
      method: 'DELETE'
    });
    await refreshCurrentWorld();
  }

  async function uploadEmotionImage(charName, emotionInput, fileInput) {
    const emotion = emotionInput.value.trim();
    const file = fileInput.files[0];
    if (!emotion || !file) return;

    const form = new FormData();
    form.append('emotion', emotion);
    form.append('image', file);
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/characters/${encodeURIComponent(charName)}/image`, {
      method: 'POST',
      body: form
    });
    await refreshCurrentWorld();
  }

  function renderLore() {
    loreList.innerHTML = '';
    const entries = currentWorldData.lore || [];

    if (!entries.length) {
      const p = document.createElement('p');
      p.className = 'character-desc';
      p.textContent = 'No lore entries yet.';
      loreList.appendChild(p);
    }

    entries.forEach((entry, index) => {
      const card = document.createElement('div');
      card.className = 'lore-card';

      const head = document.createElement('div');
      head.className = 'character-card-head';
      const title = document.createElement('strong');
      title.textContent = entry.title + (entry.alwaysOn ? ' (always on)' : '');
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteLore(index));
      head.appendChild(title);
      head.appendChild(deleteBtn);

      const keys = document.createElement('p');
      keys.className = 'character-desc';
      keys.textContent = (entry.keys || []).length ? `Keys: ${entry.keys.join(', ')}` : 'No trigger keys set.';

      const content = document.createElement('p');
      content.className = 'character-desc';
      content.textContent = entry.content;

      card.appendChild(head);
      card.appendChild(keys);
      card.appendChild(content);
      loreList.appendChild(card);
    });
  }

  async function addLore() {
    lError.textContent = '';
    const content = lContent.value.trim();
    if (!content) { lError.textContent = 'Content is required.'; return; }
    const keys = lKeys.value.split(',').map((s) => s.trim()).filter(Boolean);

    const res = await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/lore/new`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: lTitle.value.trim(), keys, content, alwaysOn: lAlways.checked })
    });
    const data = await res.json();
    if (!res.ok) { lError.textContent = data.error || 'Could not add lore entry.'; return; }

    lTitle.value = '';
    lKeys.value = '';
    lContent.value = '';
    lAlways.checked = false;
    await refreshCurrentWorld();
  }

  async function deleteLore(index) {
    await fetch(`/api/creator/worlds/${encodeURIComponent(currentWorldName)}/lore/${index}`, { method: 'DELETE' });
    await refreshCurrentWorld();
  }

  async function refreshCurrentWorld() {
    const res = await fetch(`/api/worlds/${encodeURIComponent(currentWorldName)}`);
    if (!res.ok) return;
    currentWorldData = await res.json();
    renderCoverPreview();
    renderCharacters();
    renderLore();
  }
})();

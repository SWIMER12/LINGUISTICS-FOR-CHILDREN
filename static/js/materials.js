// Страница материалов

const FILE_ICONS = {
  pdf:   'pdf',
  word:  'word',
  image: 'img',
  video: 'video',
  file:  'file',
};

document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('materials-list');
  if (!list) return;

  list.innerHTML = '';
  try {
    const data = await API.get('/api/materials');
    if (!data.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📖</div>
          <div>Материалов пока нет</div>
        </div>`;
      return;
    }
    data.forEach(m => list.appendChild(buildMaterialCard(m)));
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }
});

function buildMaterialCard(m) {
  const card = document.createElement('div');
  card.className = 'material-card';

  // ── Condition image above title ──
  if (m.image_path) {
    const img = document.createElement('img');
    img.src = m.image_path;
    img.alt = m.title;
    img.loading = 'lazy';
    img.className = 'material-card-img';
    card.appendChild(img);
  }

  // ── Title below image ──
  const header = document.createElement('div');
  header.className = 'material-card-header';
  const title = document.createElement('div');
  title.className = 'material-card-title';
  setText(title, m.title);
  header.appendChild(title);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'material-card-body';

  const condLines = (m.condition || '').split('\n');
  const PREVIEW_LINES = 3;
  const PREVIEW_CHARS = 220;
  const isLongCond = !!(m.condition && (condLines.length > PREVIEW_LINES || m.condition.length > PREVIEW_CHARS));
  const hasSolution = !!(m.solution || m.answer);

  // ── Declare refs early so condition handlers can reference them ──
  let showCommentBtn = null;
  let commentWrap   = null;

  // ── Condition ───────────────────────────────────────────────────────────
  if (m.condition) {
    if (!isLongCond) {
      // Short — show fully, no toggle
      const condDiv = document.createElement('div');
      condDiv.className = 'material-condition-preview';
      setMultilineText(condDiv, m.condition);
      body.appendChild(condDiv);
    } else {
      // Preview — first 3 lines
      const condPreview = document.createElement('div');
      condPreview.className = 'material-condition-preview material-condition-faded';
      const previewText = condLines.length > PREVIEW_LINES
        ? condLines.slice(0, PREVIEW_LINES).join('\n')
        : m.condition.slice(0, PREVIEW_CHARS);
      setMultilineText(condPreview, previewText);
      body.appendChild(condPreview);

      // "Show full condition" button
      const showCondBtn = document.createElement('button');
      showCondBtn.className = 'material-toggle-btn';
      showCondBtn.textContent = 'Показать условие полностью';
      body.appendChild(showCondBtn);

      // Animated expandable wrapper
      const condWrap = document.createElement('div');
      condWrap.className = 'material-expandable';

      const condInner = document.createElement('div');
      condInner.className = 'material-expandable-inner';

      const condContent = document.createElement('div');
      condContent.style.paddingBottom = '4px';

      const condText = document.createElement('div');
      condText.className = 'material-condition-full';
      setMultilineText(condText, m.condition);
      condContent.appendChild(condText);

      const hideCondBtn = document.createElement('button');
      hideCondBtn.className = 'material-toggle-btn';
      hideCondBtn.textContent = 'Скрыть условие';
      condContent.appendChild(hideCondBtn);

      condInner.appendChild(condContent);
      condWrap.appendChild(condInner);
      body.appendChild(condWrap);

      showCondBtn.addEventListener('click', () => {
        condWrap.classList.add('open');
        condPreview.style.display = 'none';
        showCondBtn.style.display = 'none';
        if (showCommentBtn) showCommentBtn.style.display = 'inline-flex';
      });

      hideCondBtn.addEventListener('click', () => {
        condWrap.classList.remove('open');
        condPreview.style.display = '';
        showCondBtn.style.display = '';
        if (showCommentBtn) showCommentBtn.style.display = 'none';
        if (commentWrap)    commentWrap.classList.remove('open');
      });
    }
  }

  // ── Comment ─────────────────────────────────────────────────────────────
  if (m.comment) {
    showCommentBtn = document.createElement('button');
    showCommentBtn.className = 'material-toggle-btn';
    showCommentBtn.textContent = 'Показать комментарий';
    if (isLongCond) showCommentBtn.style.display = 'none';
    body.appendChild(showCommentBtn);

    commentWrap = document.createElement('div');
    commentWrap.className = 'material-expandable';

    const commentInner = document.createElement('div');
    commentInner.className = 'material-expandable-inner';

    const commentContent = document.createElement('div');
    commentContent.style.paddingBottom = '4px';

    const commentLabel = document.createElement('div');
    commentLabel.className = 'material-block-label';
    commentLabel.textContent = 'Комментарий:';
    const commentText = document.createElement('div');
    commentText.className = 'material-solution-text';
    setMultilineText(commentText, m.comment);
    commentContent.appendChild(commentLabel);
    commentContent.appendChild(commentText);

    const hideCommentBtn = document.createElement('button');
    hideCommentBtn.className = 'material-toggle-btn';
    hideCommentBtn.textContent = 'Скрыть комментарий';
    commentContent.appendChild(hideCommentBtn);

    commentInner.appendChild(commentContent);
    commentWrap.appendChild(commentInner);
    body.appendChild(commentWrap);

    showCommentBtn.addEventListener('click', () => {
      commentWrap.classList.add('open');
      showCommentBtn.style.display = 'none';
    });
    hideCommentBtn.addEventListener('click', () => {
      commentWrap.classList.remove('open');
      showCommentBtn.style.display = 'inline-flex';
    });
  }

  // ── Solution + Answer ────────────────────────────────────────────────────
  if (hasSolution) {
    const solBtnLabel = m.solution ? 'Показать решение и ответ' : 'Показать ответ';
    const showSolBtn = document.createElement('button');
    showSolBtn.className = 'material-toggle-btn';
    showSolBtn.textContent = solBtnLabel;
    body.appendChild(showSolBtn);

    const solWrap = document.createElement('div');
    solWrap.className = 'material-expandable';

    const solInner = document.createElement('div');
    solInner.className = 'material-expandable-inner';

    const solContent = document.createElement('div');
    solContent.style.paddingBottom = '4px';

    if (m.solution_image) {
      const solImg = document.createElement('img');
      solImg.src = m.solution_image;
      solImg.alt = 'Изображение к решению';
      solImg.loading = 'lazy';
      solImg.className = 'material-card-img';
      solImg.style.marginBottom = '8px';
      solContent.appendChild(solImg);
    }

    if (m.solution) {
      const solLabel = document.createElement('div');
      solLabel.className = 'material-block-label';
      solLabel.textContent = 'Решение:';
      const solText = document.createElement('div');
      solText.className = 'material-solution-text';
      setMultilineText(solText, m.solution);
      solContent.appendChild(solLabel);
      solContent.appendChild(solText);
    }

    if (m.answer) {
      const ansLabel = document.createElement('div');
      ansLabel.className = 'material-block-label';
      ansLabel.textContent = 'Ответ:';
      const ansText = document.createElement('div');
      ansText.className = 'material-answer';
      setText(ansText, m.answer);
      solContent.appendChild(ansLabel);
      solContent.appendChild(ansText);
    }

    const hideSolBtn = document.createElement('button');
    hideSolBtn.className = 'material-toggle-btn';
    hideSolBtn.textContent = m.solution ? 'Скрыть решение и ответ' : 'Скрыть ответ';
    solContent.appendChild(hideSolBtn);

    solInner.appendChild(solContent);
    solWrap.appendChild(solInner);
    body.appendChild(solWrap);

    showSolBtn.addEventListener('click', () => {
      solWrap.classList.add('open');
      showSolBtn.style.display = 'none';
    });
    hideSolBtn.addEventListener('click', () => {
      solWrap.classList.remove('open');
      showSolBtn.style.display = 'inline-flex';
    });
  }

  card.appendChild(body);

  // ── Files ────────────────────────────────────────────────────────────────
  if (m.files && m.files.length) {
    const filesWrap = document.createElement('div');
    filesWrap.className = 'material-files';
    m.files.forEach(f => {
      const type = FILE_ICONS[f.file_type] || 'file';
      const a = document.createElement('a');
      a.href = f.file_path;
      a.download = f.original_name;
      a.className = `material-file-badge material-file-badge--${type}`;
      a.title = f.original_name;

      const iconEl = document.createElement('span');
      iconEl.className = 'file-badge-icon';
      iconEl.setAttribute('aria-hidden', 'true');

      const nameEl = document.createElement('span');
      nameEl.className = 'file-badge-name';
      setText(nameEl, f.original_name.length > 28 ? f.original_name.slice(0, 26) + '…' : f.original_name);

      a.appendChild(iconEl);
      a.appendChild(nameEl);
      filesWrap.appendChild(a);
    });
    card.appendChild(filesWrap);
  }

  return card;
}

function setText(el, text) { if (el) el.textContent = text ?? ''; }
function setMultilineText(el, text) {
  if (!el) return;
  el.innerHTML = '';
  (text ?? '').split('\n').forEach((line, i, arr) => {
    el.appendChild(document.createTextNode(line));
    if (i < arr.length - 1) el.appendChild(document.createElement('br'));
  });
}

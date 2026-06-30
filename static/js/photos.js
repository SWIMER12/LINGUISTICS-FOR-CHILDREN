// Страница фотогалереи

// Разбор русской даты из подписи вида «12 апреля 2026» → timestamp (или null)
const _RU_MONTHS = {
  'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5,
  'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11,
};
function parsePhotoDate(str) {
  if (!str) return null;
  const m = String(str).toLowerCase().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/);
  if (!m) return null;
  const mon = _RU_MONTHS[m[2]];
  if (mon === undefined) return null;
  return new Date(Number(m[3]), mon, Number(m[1])).getTime();
}

document.addEventListener('DOMContentLoaded', async () => {
  const grid    = document.getElementById('photos-grid');
  const modal   = document.getElementById('photo-modal');
  const modalImg   = document.getElementById('photo-modal-img');
  const modalTitle = document.getElementById('photo-modal-title');
  const closeBtn   = document.getElementById('photo-modal-close');

  if (!grid) return;

  let photos = [];
  try {
    photos = await API.get('/api/photos');
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
    return;
  }

  // Сортируем по дате из подписи (свежие — сверху). Фото без распознаваемой
  // даты сохраняют исходный порядок (по добавлению) и уходят в конец.
  photos.forEach((p, i) => { p._idx = i; p._ts = parsePhotoDate(p.photo_date); });
  photos.sort((a, b) => {
    if (a._ts === null && b._ts === null) return a._idx - b._idx;
    if (a._ts === null) return 1;
    if (b._ts === null) return -1;
    return b._ts - a._ts;
  });

  if (!photos.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📷</div>
        <div>Фотографий пока нет</div>
      </div>`;
    return;
  }

  // ── Раскладка в явные колонки (вместо CSS columns) ───────────────────────────
  // Так обе колонки гарантированно начинаются сверху на любом браузере,
  // включая iOS Safari (его балансировка CSS-колонок съезжала вниз).
  let curCols = 0;
  function colCount() {
    return window.matchMedia('(max-width: 480px)').matches ? 2 : 3;
  }
  function layoutPhotos() {
    const cols = colCount();
    if (cols === curCols) return;   // число колонок не изменилось — не перестраиваем
    curCols = cols;
    grid.innerHTML = '';
    const colEls = [];
    for (let i = 0; i < cols; i++) {
      const col = document.createElement('div');
      col.className = 'photos-col';
      grid.appendChild(col);
      colEls.push(col);
    }
    // Раскидываем по очереди — обе колонки начинаются с верхней карточки
    photos.forEach((p, i) => colEls[i % cols].appendChild(buildPhotoCard(p, openPhoto)));
  }
  layoutPhotos();

  let _resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(layoutPhotos, 150);
  });

  function openPhoto(src, title) {
    if (!modal || !modalImg) return;
    modalImg.src = src;
    modalImg.alt = title || '';
    if (modalTitle) setText(modalTitle, title || '');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closePhoto() {
    modal?.classList.remove('active');
    document.body.style.overflow = '';
    if (modalImg) modalImg.src = '';
  }

  closeBtn?.addEventListener('click', closePhoto);
  modal?.addEventListener('click', e => { if (e.target === modal) closePhoto(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePhoto(); });
});

function buildPhotoCard(p, onOpen) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', p.title || 'Просмотреть фото');

  const img = document.createElement('img');
  img.src = p.image_path;
  img.alt = p.title || 'Фото';
  img.loading = 'lazy';
  card.appendChild(img);

  if (p.title || p.photo_date) {
    const meta = document.createElement('div');
    meta.className = 'photo-meta';
    if (p.photo_date) {
      const dateEl = document.createElement('span');
      dateEl.className = 'photo-date';
      dateEl.textContent = p.photo_date;
      meta.appendChild(dateEl);
    }
    if (p.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'photo-title';
      setText(titleEl, p.title);
      meta.appendChild(titleEl);
    }
    card.appendChild(meta);
  }

  card.addEventListener('click', () => onOpen(p.image_path, p.title));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(p.image_path, p.title);
    }
  });

  return card;
}

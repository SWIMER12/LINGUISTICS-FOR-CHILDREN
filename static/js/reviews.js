// Страница отзывов

let _allReviews  = [];
let _visibleCnt  = 3;
const REV_STEP   = 3;

document.addEventListener('DOMContentLoaded', async () => {
  const list    = document.getElementById('reviews-list');
  const moreBtn = document.getElementById('reviews-show-more');
  if (!list) return;

  list.innerHTML = '';
  try {
    _allReviews = await API.get('/api/reviews');
    renderReviews();

    moreBtn?.addEventListener('click', () => {
      _visibleCnt += REV_STEP;
      renderReviews();
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }

  initModal();
});

function renderReviews() {
  const list    = document.getElementById('reviews-list');
  const moreBtn = document.getElementById('reviews-show-more');
  if (!list) return;

  if (!_allReviews.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <div>Отзывов пока нет</div>
      </div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const currentCount = list.querySelectorAll('.inner-card').length;
  const toShow = _allReviews.slice(currentCount, _visibleCnt);
  toShow.forEach(r => list.appendChild(buildReviewCard(r)));

  if (moreBtn) {
    moreBtn.style.display = _visibleCnt < _allReviews.length ? 'block' : 'none';
  }
}

function buildReviewCard(r) {
  const card = document.createElement('div');
  card.className = 'inner-card';

  const inner = document.createElement('div');
  inner.className = 'review-inner';

  const name = document.createElement('div');
  name.className = 'review-name';
  setText(name, r.name);

  const text = document.createElement('div');
  text.className = 'review-text';
  setMultilineText(text, r.text);

  const row = document.createElement('div');
  row.className = 'review-row';

  if (r.image_path) {
    const imgBtn = document.createElement('button');
    imgBtn.className = 'review-img-btn';
    imgBtn.textContent = '📷 Скриншот';
    imgBtn.setAttribute('aria-label', `Посмотреть скриншот переписки — отзыв от ${r.name}`);
    imgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReviewModal(r);
    });
    row.appendChild(imgBtn);
  }

  inner.append(name, text, row);
  card.appendChild(inner);
  return card;
}

// ── Модальное окно скриншота ──────────────────────────────────────────────────
function initModal() {
  const overlay = document.getElementById('review-modal');
  const closeBtn = document.getElementById('review-modal-close');
  if (!overlay) return;

  const close = () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  closeBtn?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function openReviewModal(r) {
  const overlay = document.getElementById('review-modal');
  const body    = document.getElementById('review-modal-body');
  if (!overlay || !body) return;

  body.innerHTML = '';

  if (r.image_path) {
    const img = document.createElement('img');
    img.src = r.image_path;
    img.alt = `Скриншот переписки — отзыв от ${r.name}`;
    body.appendChild(img);
  }

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

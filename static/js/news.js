// Страница новостей

let _allNews   = [];
let _visibleCnt  = 5;
const NEWS_STEP  = 3;

document.addEventListener('DOMContentLoaded', async () => {
  const list    = document.getElementById('news-list');
  const moreBtn = document.getElementById('news-show-more');
  if (!list) return;

  list.innerHTML = '';
  try {
    _allNews = await API.get('/api/news');
    renderNews();

    moreBtn?.addEventListener('click', () => {
      _visibleCnt += NEWS_STEP;
      renderNews();
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }
});

function renderNews() {
  const list    = document.getElementById('news-list');
  const moreBtn = document.getElementById('news-show-more');
  if (!list) return;

  if (!_allNews.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📰</div>
        <div>Новостей пока нет</div>
      </div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const currentCount = list.querySelectorAll('.inner-card').length;
  const toShow = _allNews.slice(currentCount, _visibleCnt);
  toShow.forEach(n => list.appendChild(buildNewsCard(n)));

  if (moreBtn) {
    moreBtn.style.display = _visibleCnt < _allNews.length ? 'block' : 'none';
  }
}

function buildNewsCard(n) {
  const card = document.createElement('div');
  card.className = 'inner-card';

  const inner = document.createElement('div');
  inner.className = 'news-inner';

  if (n.image_path) {
    const img = document.createElement('img');
    img.src = n.image_path;
    img.alt = n.title;
    img.loading = 'lazy';
    inner.appendChild(img);
  }

  const title = document.createElement('div');
  title.className = 'news-title';
  setText(title, n.title);

  const text = document.createElement('div');
  text.className = 'news-text';
  setMultilineText(text, n.text);

  const date = document.createElement('div');
  date.className = 'news-date';
  setText(date, '📅 ' + (n.pub_date || formatDate(n.created_at)));

  inner.append(title, text, makeClampable(text), date);
  card.appendChild(inner);
  return card;
}

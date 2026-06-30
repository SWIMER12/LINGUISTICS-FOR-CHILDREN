// Страница блога

let _allBlog    = [];
let _visibleCnt = 5;
const BLOG_STEP = 3;

document.addEventListener('DOMContentLoaded', async () => {
  const list    = document.getElementById('blog-list');
  const moreBtn = document.getElementById('blog-show-more');
  if (!list) return;

  list.innerHTML = '';
  try {
    _allBlog = await API.get('/api/blog');
    renderBlog();

    moreBtn?.addEventListener('click', () => {
      _visibleCnt += BLOG_STEP;
      renderBlog();
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }
});

function renderBlog() {
  const list    = document.getElementById('blog-list');
  const moreBtn = document.getElementById('blog-show-more');
  if (!list) return;

  if (!_allBlog.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div>Записей в блоге пока нет</div>
      </div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const currentCount = list.querySelectorAll('.inner-card').length;
  const toShow = _allBlog.slice(currentCount, _visibleCnt);
  toShow.forEach(n => list.appendChild(buildBlogCard(n)));

  if (moreBtn) {
    moreBtn.style.display = _visibleCnt < _allBlog.length ? 'block' : 'none';
  }
}

function buildBlogCard(n) {
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

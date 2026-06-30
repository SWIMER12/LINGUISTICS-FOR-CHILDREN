// Страница курсов

let _allCourses  = [];
let _visibleCnt  = 5;
const CRS_STEP   = 3;

const COURSE_STATUS = {
  open:     '● Набор открыт',
  ongoing:  '● Курс идёт',
  finished: '● Курс закончился',
  upcoming: '● Скоро',
  custom:   '●',
  closed:   '● Запись закрыта',
};

document.addEventListener('DOMContentLoaded', async () => {
  const list    = document.getElementById('courses-grid');
  const moreBtn = document.getElementById('courses-show-more');
  if (!list) return;

  list.innerHTML = '';
  try {
    _allCourses = await API.get('/api/courses');
    renderCourses();
    injectCoursesSchema(_allCourses);

    moreBtn?.addEventListener('click', () => {
      _visibleCnt += CRS_STEP;
      renderCourses();
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }

});

function injectCoursesSchema(courses) {
  const items = courses.map(c => {
    const item = {
      '@type': 'Course',
      name: c.title,
      description: c.description || c.title,
      provider: {
        '@type': 'Organization',
        name: 'Лингвистика для детей',
        url: location.origin,
      },
    };
    if (c.is_free) {
      item.offers = { '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock' };
    } else if (c.price_month) {
      item.offers = { '@type': 'Offer', price: String(c.price_month), priceCurrency: 'RUB' };
    }
    return item;
  });

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': items });
  document.head.appendChild(script);
}

function renderCourses() {
  const list    = document.getElementById('courses-grid');
  const moreBtn = document.getElementById('courses-show-more');
  if (!list) return;

  if (!_allCourses.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div>Курсов пока нет. Скоро появятся новые программы.</div>
      </div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const currentCount = list.querySelectorAll('.inner-card').length;
  const toShow = _allCourses.slice(currentCount, _visibleCnt);
  toShow.forEach(c => list.appendChild(buildCourseCard(c)));

  if (moreBtn) {
    moreBtn.style.display = _visibleCnt < _allCourses.length ? 'block' : 'none';
  }
}

function getCourseStatusLabel(c) {
  if (c.status === 'custom') {
    return '● ' + (c.custom_status_label || 'Свой статус');
  }
  return COURSE_STATUS[c.status] || c.status;
}

const _SVG_GRAD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="6 12 6 18 12 21 18 18 18 12"/><line x1="22" y1="7" x2="22" y2="13"/></svg>`;
const _SVG_CAL_COUNT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="14" width="2" height="2" fill="currentColor" stroke="none"/><rect x="11" y="14" width="2" height="2" fill="currentColor" stroke="none"/><rect x="15" y="14" width="2" height="2" fill="currentColor" stroke="none"/></svg>`;
const _SVG_CAL_DATE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2" fill="currentColor" stroke="none"/></svg>`;
const _SVG_CLOCK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

function formatPrice(num) {
  return Number(num).toLocaleString('ru-RU');
}

function buildInfoBlock(iconSvg, label, value) {
  const block = document.createElement('div');
  block.className = 'course-info-block';

  const iconEl = document.createElement('div');
  iconEl.className = 'course-info-icon';
  iconEl.innerHTML = iconSvg;

  const textEl = document.createElement('div');
  textEl.className = 'course-info-text';

  const labelEl = document.createElement('div');
  labelEl.className = 'course-info-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('div');
  valueEl.className = 'course-info-value';
  valueEl.textContent = value;

  textEl.append(labelEl, valueEl);
  block.append(iconEl, textEl);
  return block;
}

function buildCourseCard(c) {
  const card = document.createElement('div');
  card.className = 'inner-card course-card-v';

  // Badge
  const badge = document.createElement('span');
  badge.className = `badge badge-${c.status}`;
  badge.textContent = getCourseStatusLabel(c);

  // Title
  const title = document.createElement('div');
  title.className = 'course-title-v';
  setText(title, c.title);

  // Description
  const desc = document.createElement('div');
  desc.className = 'course-desc-v';
  if (c.description) setMultilineText(desc, c.description);

  // Info blocks
  const infoBlocks = document.createElement('div');
  infoBlocks.className = 'course-info-blocks';
  [
    { icon: _SVG_GRAD,       label: 'Класс',               value: c.age_range },
    { icon: _SVG_CAL_COUNT,  label: 'Количество занятий',  value: c.lesson_count },
    { icon: _SVG_CAL_DATE,   label: 'Даты занятий',        value: c.dates },
    { icon: _SVG_CLOCK,      label: 'Расписание',          value: c.schedule },
  ].forEach(({ icon, label, value }) => {
    if (value) infoBlocks.appendChild(buildInfoBlock(icon, label, value));
  });

  // Price section
  const priceSection = document.createElement('div');
  priceSection.className = 'course-price-section';
  if (c.is_free) {
    const freeEl = document.createElement('span');
    freeEl.className = 'course-price-num course-price-free';
    freeEl.textContent = 'Бесплатно';
    priceSection.appendChild(freeEl);
  } else if (c.price_month) {
    const suffix = c.price_type === 'course' ? 'за 1 занятие в абонементе' : 'мес.';
    const numEl = document.createElement('span');
    numEl.className = 'course-price-num';
    numEl.textContent = formatPrice(c.price_month);
    const rubEl = document.createElement('span');
    rubEl.className = 'course-price-rub';
    rubEl.textContent = ' ₽';
    const suffEl = document.createElement('span');
    suffEl.className = 'course-price-suffix';
    suffEl.textContent = ` / ${suffix}`;
    priceSection.append(numEl, rubEl, suffEl);
  }

  // CTA button
  const ctaWrap = document.createElement('div');
  let btn;
  if (c.enrollment_open && c.enrollment_link) {
    btn = document.createElement('a');
    btn.className = 'btn btn-primary course-cta-btn';
    btn.href = c.enrollment_link;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = 'Записаться на курс';
  } else if (c.enrollment_open) {
    btn = document.createElement('button');
    btn.className = 'btn btn-primary course-cta-btn';
    btn.textContent = 'Записаться на курс';
    btn.disabled = true;
    btn.type = 'button';
  } else {
    btn = document.createElement('button');
    btn.className = 'btn btn-ghost course-cta-btn course-cta-closed';
    btn.textContent = 'Запись закрыта';
    btn.disabled = true;
    btn.type = 'button';
  }
  ctaWrap.appendChild(btn);

  const spacer = document.createElement('div');
  spacer.className = 'course-card-spacer';

  const children = [badge, title];
  if (c.description) children.push(desc, makeClampable(desc));
  children.push(spacer);
  if (infoBlocks.childElementCount > 0) children.push(infoBlocks);
  if (c.is_free || c.price_month) children.push(priceSection);
  children.push(ctaWrap);
  card.append(...children);
  return card;
}


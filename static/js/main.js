// Главная страница

let _homeCourses  = [];

const COURSE_STATUS = {
  open:     '● Набор открыт',
  ongoing:  '● Курс идёт',
  finished: '● Курс закончился',
  upcoming: '● Скоро',
  custom:   '●',
  closed:   '● Запись закрыта',
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadHomepageBlocks();
  await loadHomeCoursesPreview();
  await loadHomeProjectsPreview();
  initContactMethod();
  initContactForm();
  initScrollToContact();
});

// ── Курсы-превью ──────────────────────────────────────────────────────────────
async function loadHomeCoursesPreview() {
  const list    = document.getElementById('courses-preview');
  const moreBtn = document.getElementById('courses-show-more');
  if (!list) return;

  list.innerHTML = '';
  if (moreBtn) moreBtn.style.display = 'none';
  try {
    const all = await API.get('/api/courses');
    _homeCourses = all.filter(c => c.enrollment_open);
    renderHomeCourses();
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }
}

function renderHomeCourses() {
  const list = document.getElementById('courses-preview');
  if (!list) return;

  if (!_homeCourses.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div>Курсы скоро появятся</div>
      </div>`;
    return;
  }

  list.innerHTML = '';
  _homeCourses.forEach(c => list.appendChild(buildHomeCourseCard(c)));
}

function getCourseStatusLabel(c) {
  if (c.status === 'custom') return '● ' + (c.custom_status_label || 'Свой статус');
  return COURSE_STATUS[c.status] || c.status;
}

const _HOME_SVG_GRAD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="6 12 6 18 12 21 18 18 18 12"/><line x1="22" y1="7" x2="22" y2="13"/></svg>`;
const _HOME_SVG_CAL_COUNT = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="7" y="14" width="2" height="2" fill="currentColor" stroke="none"/><rect x="11" y="14" width="2" height="2" fill="currentColor" stroke="none"/><rect x="15" y="14" width="2" height="2" fill="currentColor" stroke="none"/></svg>`;
const _HOME_SVG_CAL_DATE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2" fill="currentColor" stroke="none"/></svg>`;
const _HOME_SVG_CLOCK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const _HOME_SVG_MONITOR = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
const _HOME_SVG_MAPPIN  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

function buildHomeInfoBlock(iconSvg, label, value) {
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

function buildHomeCourseCard(c) {
  const card = document.createElement('div');
  card.className = 'inner-card course-card-v';

  const badge = document.createElement('span');
  badge.className = `badge badge-${c.status}`;
  badge.textContent = getCourseStatusLabel(c);

  const title = document.createElement('div');
  title.className = 'course-title-v';
  setText(title, c.title);

  const desc = document.createElement('div');
  desc.className = 'course-desc-v';
  if (c.description) setMultilineText(desc, c.description);

  const infoBlocks = document.createElement('div');
  infoBlocks.className = 'course-info-blocks';
  [
    { icon: _HOME_SVG_GRAD,       label: 'Класс',              value: c.age_range },
    { icon: _HOME_SVG_CAL_COUNT,  label: 'Количество занятий', value: c.lesson_count },
    { icon: _HOME_SVG_CAL_DATE,   label: 'Даты занятий',       value: c.dates },
    { icon: _HOME_SVG_CLOCK,      label: 'Расписание',         value: c.schedule },
  ].forEach(({ icon, label, value }) => {
    if (value) infoBlocks.appendChild(buildHomeInfoBlock(icon, label, value));
  });

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
    numEl.textContent = Number(c.price_month).toLocaleString('ru-RU');
    const rubEl = document.createElement('span');
    rubEl.className = 'course-price-rub';
    rubEl.textContent = ' ₽';
    const suffEl = document.createElement('span');
    suffEl.className = 'course-price-suffix';
    suffEl.textContent = ` / ${suffix}`;
    priceSection.append(numEl, rubEl, suffEl);
  }

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

// ── Проекты-превью ────────────────────────────────────────────────────────────
async function loadHomeProjectsPreview() {
  const list = document.getElementById('projects-preview');
  if (!list) return;

  list.innerHTML = '';
  try {
    const projects = await API.get('/api/projects');
    if (!projects.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div>Проекты скоро появятся</div>
        </div>`;
      return;
    }
    list.appendChild(buildHomeProjectCard(projects[0]));
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }
}

function buildHomeProjectCard(p) {
  const block = document.createElement('div');
  block.className = 'inner-card project-block';

  // Заголовок проекта
  const header = document.createElement('div');
  header.className = 'project-block-header';
  const title = document.createElement('div');
  title.className = 'project-block-title';
  setText(title, p.title);
  header.appendChild(title);
  if (p.description) {
    const desc = document.createElement('div');
    desc.className = 'project-block-desc';
    setMultilineText(desc, p.description);
    header.appendChild(desc);
    header.appendChild(makeClampable(desc));
  }
  block.appendChild(header);

  // Выбрать лекцию: сначала open/upcoming, иначе первая в списке
  // (админ ставит самую свежую лекцию наверх, sort_order=0).
  const lectures = p.lectures || [];
  const active = lectures.find(l => l.status === 'open' || l.status === 'upcoming')
    || lectures[0];

  const lecturesWrap = document.createElement('div');
  lecturesWrap.className = 'project-block-lectures';

  if (active) {
    lecturesWrap.appendChild(buildHomeLectureCard(active));
  } else {
    const empty = document.createElement('div');
    empty.className = 'lectures-empty-pub';
    empty.textContent = 'Лекции скоро будут добавлены';
    lecturesWrap.appendChild(empty);
  }
  block.appendChild(lecturesWrap);
  return block;
}

function buildHomeLectureCard(l) {
  const card = document.createElement('div');
  card.className = 'lecture-card';

  // Статус вверху
  const LECT_STATUS_HOME = { open:'● Набор открыт', finished:'● Завершена', upcoming:'● Скоро', custom:'●', closed:'● Запись закрыта' };
  const badge = document.createElement('span');
  badge.className = `badge badge-${l.status}`;
  badge.textContent = l.status === 'custom' ? ('● ' + (l.custom_status_label || 'Свой статус')) : (LECT_STATUS_HOME[l.status] || l.status);
  card.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'lecture-card-body';

  // Левый столбец
  const left = document.createElement('div');
  left.className = 'lecture-col-left';

  const photoWrap = document.createElement('div');
  photoWrap.className = 'lecture-photo-wrap';
  if (l.lecturer_photo) {
    const img = document.createElement('img');
    img.src = l.lecturer_photo;
    img.alt = l.lecturer_name || '';
    img.loading = 'lazy';
    photoWrap.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'lecture-photo-placeholder';
    ph.textContent = '👤';
    photoWrap.appendChild(ph);
  }
  left.appendChild(photoWrap);

  if (l.lecturer_name) {
    const name = document.createElement('div');
    name.className = 'lecture-lecturer-name';
    setText(name, l.lecturer_name);
    left.appendChild(name);
  }
  if (l.lecturer_bio) {
    const bio = document.createElement('div');
    bio.className = 'lecture-lecturer-bio';
    setMultilineText(bio, l.lecturer_bio);
    left.appendChild(bio);
    left.appendChild(makeClampable(bio));
  }

  // Правый столбец
  const right = document.createElement('div');
  right.className = 'lecture-col-right';

  const lTitle = document.createElement('div');
  lTitle.className = 'lecture-title';
  setText(lTitle, l.title);
  right.appendChild(lTitle);

  if (l.description) {
    const desc = document.createElement('div');
    desc.className = 'lecture-desc';
    setMultilineText(desc, l.description);
    right.appendChild(desc);
    right.appendChild(makeClampable(desc));
  }

  const infoBlocks = document.createElement('div');
  infoBlocks.className = 'lecture-info-blocks';

  if (l.lecture_datetime) infoBlocks.appendChild(buildHomeInfoBlock(_HOME_SVG_CAL_DATE, 'Дата и время', l.lecture_datetime));
  if (l.event_format_text || l.event_format) {
    const fmtSvg = l.event_format === 'offline' ? _HOME_SVG_MAPPIN : _HOME_SVG_MONITOR;
    infoBlocks.appendChild(buildHomeInfoBlock(fmtSvg, 'Формат мероприятия', l.event_format_text || (l.event_format === 'offline' ? 'Очно' : 'Онлайн')));
  }

  if (infoBlocks.children.length) right.appendChild(infoBlocks);

  const priceWrap = document.createElement('div');
  priceWrap.className = 'lecture-price-wrap';

  if (l.is_free) {
    const ps = document.createElement('div'); ps.className = 'course-price-section';
    const fr = document.createElement('span'); fr.className = 'course-price-num course-price-free'; fr.textContent = 'Бесплатно';
    ps.appendChild(fr); priceWrap.appendChild(ps);
  } else if (l.price) {
    const ps = document.createElement('div'); ps.className = 'course-price-section';
    const n = document.createElement('span'); n.className = 'course-price-num'; n.textContent = Number(l.price).toLocaleString('ru-RU');
    const r = document.createElement('span'); r.className = 'course-price-rub'; r.textContent = ' ₽';
    const s = document.createElement('span'); s.className = 'course-price-suffix'; s.textContent = ' / ' + (l.price_suffix || 'свой вариант');
    ps.append(n, r, s); priceWrap.appendChild(ps);
  }

  let btn;
  if (l.enrollment_open && l.enrollment_link) {
    btn = document.createElement('a');
    btn.className = 'btn btn-primary course-cta-btn';
    btn.href = l.enrollment_link;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = 'Записаться на ' + (l.event_type || 'лекцию');
  } else {
    btn = document.createElement('button');
    btn.className = 'btn btn-ghost course-cta-btn course-cta-closed';
    btn.type = 'button';
    btn.textContent = 'Запись закрыта';
    btn.disabled = true;
  }
  priceWrap.appendChild(btn);
  right.appendChild(priceWrap);

  body.appendChild(left);
  body.appendChild(right);
  card.appendChild(body);
  return card;
}

// ── Выбор способа связи ───────────────────────────────────────────────────────
function initContactMethod() {
  const radios    = document.querySelectorAll('input[name="contact_method"]');
  const phoneGrp  = document.getElementById('c-phone-group');
  const emailGrp  = document.getElementById('c-email-group');
  if (!radios.length || !phoneGrp || !emailGrp) return;

  function update(val) {
    const isEmail = val === 'email';
    phoneGrp.style.display = isEmail ? 'none' : 'block';
    emailGrp.style.display = isEmail ? 'block' : 'none';
  }

  radios.forEach(r => r.addEventListener('change', () => update(r.value)));

  const checked = document.querySelector('input[name="contact_method"]:checked');
  if (checked) update(checked.value);
}

// ── Форма обратной связи ──────────────────────────────────────────────────────
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('contact-alert');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;

    try {
      const method  = document.querySelector('input[name="contact_method"]:checked')?.value || 'email';
      const contact = method === 'email'
        ? document.getElementById('c-email')?.value.trim()
        : document.getElementById('c-phone')?.value.trim();

      await API.post('/api/contact', {
        name:           form.name.value.trim(),
        email:          contact || '',
        message:        form.message.value.trim(),
        contact_method: method,
        website:        form.website ? form.website.value : '',
      });
      alertEl.className = 'alert alert-success';
      alertEl.textContent = 'Сообщение отправлено! Свяжусь с вами в ближайшее время.';
      alertEl.style.display = 'block';
      form.reset();
    } catch (err) {
      alertEl.className = 'alert alert-error';
      alertEl.textContent = err.message;
      alertEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}

function initScrollToContact() {
  document.querySelectorAll('[data-scroll-contact]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

// ── Gallery ────────────────────────────────────────────────────────────────────

function _makeGalleryItem(imgObj, alt) {
  const parts = (imgObj.image_ratio || '3:2').split(':');
  const ratio = (Number(parts[0]) / Number(parts[1])) || 1.5;

  const item = document.createElement('div');
  item.className = 'hp-gallery-item';
  item.style.aspectRatio = String(ratio);

  const img = document.createElement('img');
  img.src = imgObj.image_path;
  img.alt = alt;
  img.loading = 'lazy';
  img.className = 'hp-gallery-img no-copy';
  img.addEventListener('contextmenu', e => e.preventDefault());
  img.addEventListener('dragstart', e => e.preventDefault());
  item.appendChild(img);
  return { item, ratio };
}

// Thumbnails: фиксированная высота, без обрезки, пространство справа допустимо.
function buildHpGalleryThumbnails(images, alt) {
  const grid = document.createElement('div');
  grid.className = 'hp-gallery-grid hp-gallery-grid--thumbnails';
  images.forEach(imgObj => {
    const { item } = _makeGalleryItem(imgObj, alt);
    grid.appendChild(item);
  });
  return grid;
}


// ── Блоки главной (о преподавателе) ──────────────────────────────────────────

const _HP_TYPES = {
  intro:                  'image',
  project_origin:         'text',
  courses_list:           'text',
  travel_notes:           'text',
  my_universities:        'text',
  philology_experience:   'text',
  teaching_experience:    'image',
  olympiad_participation: 'gallery',
  education_diplomas:     'gallery',
};

async function loadHomepageBlocks() {
  const container = document.getElementById('homepage-blocks-container');
  if (!container) return;
  try {
    const blocks = await API.get('/api/homepage');

    const filledBlocks = blocks.filter(b =>
      b.content || b.image_path || (b.images && b.images.length)
    );
    if (!filledBlocks.length) return;

    const tile = document.createElement('div');
    tile.className = 'tile';
    const body = document.createElement('div');
    body.className = 'tile-body';

    const header = document.createElement('div');
    header.className = 'tile-header';
    const titleEl = document.createElement('div');
    titleEl.className = 'tile-title';
    titleEl.textContent = 'О проекте и преподавателе';
    header.appendChild(titleEl);
    body.appendChild(header);

    const list = document.createElement('div');
    list.className = 'inner-cards-list';

    filledBlocks.forEach(b => {
      list.appendChild(buildHpSection(b, _HP_TYPES[b.block_key] || 'text'));
    });

    body.appendChild(list);
    tile.appendChild(body);
    container.appendChild(tile);
  } catch (e) {
    console.error('Ошибка загрузки блоков главной:', e);
  }
}

function buildHpSection(b, type) {
  const section = document.createElement('div');
  section.className = 'inner-card hp-section';
  if (b.block_key) section.dataset.block = b.block_key;

  if (type !== 'image' && b.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'hp-section-title';
    titleEl.textContent = b.title;
    section.appendChild(titleEl);
  }

  if (type === 'text') {
    if (b.content) {
      const textEl = document.createElement('div');
      textEl.className = 'hp-block-text';
      setMultilineText(textEl, b.content);
      section.appendChild(textEl);
      section.appendChild(makeClampable(textEl));
    }

  } else if (type === 'image') {
    const wrap = document.createElement('div');
    wrap.className = 'hp-image-wrap';

    const leftCol = document.createElement('div');
    leftCol.className = 'hp-image-left';

    const textGroup = document.createElement('div');
    textGroup.className = 'hp-image-text-group';
    if (b.title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'hp-section-title';
      titleEl.textContent = b.title;
      textGroup.appendChild(titleEl);
    }
    if (b.content) {
      const textEl = document.createElement('div');
      textEl.className = 'hp-block-text';
      setMultilineText(textEl, b.content);
      textGroup.appendChild(textEl);
      textGroup.appendChild(makeClampable(textEl));
    }
    leftCol.appendChild(textGroup);

    const pill = document.createElement('div');
    pill.className = 'hp-contact-pill';
    [
      { href: 'https://vk.com/linguistics_for_children', icon: '/icons/vk.svg',      alt: 'ВКонтакте', copy: null },
      { href: 'https://t.me/linguistics_for_children',   icon: '/icons/telegram.svg', alt: 'Telegram',  copy: null },
      { href: '#', icon: '/icons/sms.svg',   alt: 'Телефон', copy: '+7 905 211 80 10' },
      { href: '#', icon: '/icons/email.svg', alt: 'Email',   copy: 'i-krylova178@yandex.ru' },
    ].forEach(({ href, icon, alt, copy }) => {
      const a = document.createElement('a');
      a.href = href;
      a.className = 'hp-contact-pill-btn';
      if (copy) {
        a.dataset.copy = copy;
      } else {
        a.target = '_blank';
        a.rel = 'noopener';
      }
      const img = document.createElement('img');
      img.src = icon;
      img.alt = alt;
      a.appendChild(img);
      pill.appendChild(a);
    });
    leftCol.appendChild(pill);

    wrap.appendChild(leftCol);

    if (b.image_path) {
      const img = document.createElement('img');
      img.src = b.image_path;
      img.alt = b.title || '';
      img.loading = 'lazy';
      img.className = 'hp-main-img no-copy';
      img.addEventListener('contextmenu', e => e.preventDefault());
      img.addEventListener('dragstart', e => e.preventDefault());
      wrap.appendChild(img);
    }
    section.appendChild(wrap);

  } else if (type === 'gallery') {
    if (b.content) {
      const textEl = document.createElement('div');
      textEl.className = 'hp-block-text';
      textEl.style.marginBottom = '16px';
      setMultilineText(textEl, b.content);
      section.appendChild(textEl);
      section.appendChild(makeClampable(textEl));
    }
    if (b.images && b.images.length) {
      section.appendChild(buildHpGalleryThumbnails(b.images, b.title || ''));
    }
  }

  return section;
}


// Страница проектов

const LECT_STATUS = {
  open:     '● Набор открыт',
  finished: '● Завершена',
  upcoming: '● Скоро',
  custom:   '●',
  closed:   '● Запись закрыта',
};

const _SVG_DATE           = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2" fill="currentColor" stroke="none"/></svg>`;
const _SVG_TIME           = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 12"/></svg>`;
const _SVG_WORKPLACE      = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12.01" y2="12" stroke-width="3"/></svg>`;
const _SVG_DEGREE         = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
const _SVG_FORMAT_ONLINE  = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 16 21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
const _SVG_FORMAT_OFFLINE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

document.addEventListener('DOMContentLoaded', async () => {
  const list = document.getElementById('projects-list');
  if (!list) return;

  try {
    const projects = await API.get('/api/projects');
    if (!projects.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div>Проектов пока нет</div>
        </div>`;
    } else {
      projects.forEach(p => list.appendChild(buildProjectBlock(p)));
      injectProjectsSchema(projects);
    }
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div>${e.message}</div></div>`;
  }

  initLectureModal();
});

function getLectureStatusLabel(l) {
  if (l.status === 'custom') return '● ' + (l.custom_status_label || 'Свой статус');
  return LECT_STATUS[l.status] || l.status;
}

function buildProjectBlock(p) {
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

  // Лекции
  const lecturesWrap = document.createElement('div');
  lecturesWrap.className = 'project-block-lectures';

  if (p.lectures && p.lectures.length) {
    p.lectures.forEach(l => lecturesWrap.appendChild(buildLectureCard(l)));
  } else {
    const empty = document.createElement('div');
    empty.className = 'lectures-empty-pub';
    empty.textContent = 'Лекции скоро будут добавлены';
    lecturesWrap.appendChild(empty);
  }

  block.appendChild(lecturesWrap);
  return block;
}

function buildInfoBlock(svg, label, value) {
  const block = document.createElement('div');
  block.className = 'course-info-block';
  block.innerHTML = `
    <div class="course-info-icon">${svg}</div>
    <div class="course-info-text">
      <div class="course-info-label"></div>
      <div class="course-info-value"></div>
    </div>`;
  block.querySelector('.course-info-label').textContent = label;
  block.querySelector('.course-info-value').textContent = value;
  return block;
}

function buildLectureCard(l) {
  const card = document.createElement('div');
  card.className = 'lecture-card';

  // ── Статус вверху ─────────────────────────────────────────
  const badge = document.createElement('span');
  badge.className = `badge badge-${l.status}`;
  badge.textContent = getLectureStatusLabel(l);
  card.appendChild(badge);

  // ── Двухколоночное тело ───────────────────────────────────
  const body = document.createElement('div');
  body.className = 'lecture-card-body';

  // ── Левый столбец: фото, ФИО, место работы, степень ──────
  const left = document.createElement('div');
  left.className = 'lecture-col-left';

  const photoWrap = document.createElement('div');
  photoWrap.className = 'lecture-photo-wrap';
  if (l.lecturer_photo) {
    const img = document.createElement('img');
    img.src = l.lecturer_photo;
    img.alt = l.lecturer_name || 'Фото лектора';
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

  // ── Правый столбец: название, описание, дата, время, цена, кнопка ──
  const right = document.createElement('div');
  right.className = 'lecture-col-right';

  const title = document.createElement('div');
  title.className = 'lecture-title';
  setText(title, l.title);
  right.appendChild(title);

  if (l.description) {
    const desc = document.createElement('div');
    desc.className = 'lecture-desc';
    setMultilineText(desc, l.description);
    right.appendChild(desc);
    right.appendChild(makeClampable(desc));
  }

  // Синие инфо-блоки (дата + формат) — wrapped, margin-top:auto centres them
  const infoBlocks = document.createElement('div');
  infoBlocks.className = 'lecture-info-blocks';

  if (l.lecture_datetime) infoBlocks.appendChild(buildInfoBlock(_SVG_DATE, 'Дата и время', l.lecture_datetime));

  if (l.event_format_text || l.event_format) {
    const fmtSvg = l.event_format === 'offline' ? _SVG_FORMAT_OFFLINE : _SVG_FORMAT_ONLINE;
    infoBlocks.appendChild(buildInfoBlock(fmtSvg, 'Формат мероприятия', l.event_format_text || (l.event_format === 'offline' ? 'Очно' : 'Онлайн')));
  }

  if (infoBlocks.children.length) right.appendChild(infoBlocks);

  // Цена + кнопка — wrapped, margin-top:auto pushes to bottom
  const priceWrap = document.createElement('div');
  priceWrap.className = 'lecture-price-wrap';

  if (l.is_free) {
    const ps = document.createElement('div');
    ps.className = 'course-price-section';
    const freeEl = document.createElement('span');
    freeEl.className = 'course-price-num course-price-free';
    freeEl.textContent = 'Бесплатно';
    ps.appendChild(freeEl);
    priceWrap.appendChild(ps);
  } else if (l.price) {
    const ps = document.createElement('div');
    ps.className = 'course-price-section';
    const numEl = document.createElement('span'); numEl.className = 'course-price-num'; numEl.textContent = Number(l.price).toLocaleString('ru-RU');
    const rubEl = document.createElement('span'); rubEl.className = 'course-price-rub'; rubEl.textContent = ' ₽';
    const sfxEl = document.createElement('span'); sfxEl.className = 'course-price-suffix'; sfxEl.textContent = ' / ' + (l.price_suffix || 'свой вариант');
    ps.append(numEl, rubEl, sfxEl);
    priceWrap.appendChild(ps);
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

// ── Модальное окно записи на лекцию ──────────────────────────────────────────
function openLectureModal(lectureId, lectureTitle) {
  const overlay  = document.getElementById('lecture-enroll-modal');
  const nameEl   = document.getElementById('lecture-modal-name');
  const alertEl  = document.getElementById('lecture-enroll-alert');
  const form     = document.getElementById('lecture-enroll-form');
  const idInput  = document.getElementById('le-lecture-id');
  if (!overlay) return;
  setText(nameEl, lectureTitle);
  if (idInput) idInput.value = lectureId;
  if (alertEl) alertEl.style.display = 'none';
  form?.reset();
  if (idInput) idInput.value = lectureId;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function initLectureModal() {
  const overlay  = document.getElementById('lecture-enroll-modal');
  const closeBtn = document.getElementById('lecture-modal-close');
  const form     = document.getElementById('lecture-enroll-form');
  if (!overlay) return;

  const close = () => {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn     = form.querySelector('[type=submit]');
    const alertEl = document.getElementById('lecture-enroll-alert');
    btn.disabled  = true;

    try {
      await API.post('/api/lecture-enroll', {
        lecture_id: Number(document.getElementById('le-lecture-id').value),
        name:       document.getElementById('le-name').value.trim(),
        email:      document.getElementById('le-contact').value.trim(),
      });
      alertEl.className = 'alert alert-success';
      alertEl.textContent = 'Заявка отправлена! Свяжусь с вами в ближайшее время.';
      alertEl.style.display = 'block';
      form.reset();
      setTimeout(close, 2400);
    } catch (err) {
      alertEl.className = 'alert alert-error';
      alertEl.textContent = err.message;
      alertEl.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}

function injectProjectsSchema(projects) {
  const events = [];
  projects.forEach(p => {
    (p.lectures || []).forEach(l => {
      const ev = {
        '@type': 'Event',
        name: l.title,
        description: l.description || l.title,
        organizer: { '@type': 'Organization', name: 'Лингвистика для детей', url: location.origin },
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: l.event_format === 'offline'
          ? 'https://schema.org/OfflineEventAttendanceMode'
          : 'https://schema.org/OnlineEventAttendanceMode',
      };
      if (l.lecture_datetime) ev.startDate = l.lecture_datetime;
      if (l.lecturer_name) ev.performer = { '@type': 'Person', name: l.lecturer_name };
      if (l.is_free) {
        ev.offers = { '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock' };
      } else if (l.price) {
        ev.offers = { '@type': 'Offer', price: String(l.price), priceCurrency: 'RUB' };
      }
      events.push(ev);
    });
  });

  if (!events.length) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': events });
  document.head.appendChild(script);
}

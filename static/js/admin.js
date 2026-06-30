// ── Auth check ─────────────────────────────────────────────────────────────────
async function checkAuth() {
  try {
    const res = await API.get('/api/admin/check');
    if (!res.ok) {
      window.location.href = '/admin';
      return false;
    }
    const userEl = document.getElementById('admin-username');
    if (userEl) setText(userEl, res.username);
    return true;
  } catch {
    window.location.href = '/admin';
    return false;
  }
}

// ── Toast ───────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

// ── Confirm ─────────────────────────────────────────────────────────────────────
function confirmAction(msg) {
  return window.confirm(msg);
}

// ── Modal helpers ───────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
  document.body.style.overflow = '';
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// ── Section nav ─────────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section-panel').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`section-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${name}"]`)?.classList.add('active');

  const titles = {
    dashboard: 'Панель управления',
    homepage: 'Главная страница',
    courses: 'Курсы',
    projects: 'Проекты',
    reviews: 'Отзывы',
    news: 'Новости',
    blog: 'Блог',
    materials: 'Материалы',
    photos: 'Фото',
    faq: 'FAQ',
    messages: 'Сообщения',
  };
  const titleEl = document.getElementById('section-title');
  if (titleEl) titleEl.textContent = titles[name] || name;

  loaders[name]?.();
}

const loaders = {};


// ── Init ────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (!authed) return;

  // Sidebar nav
  document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      showSection(btn.dataset.section);
      closeSidebar();
    });
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    await API.post('/api/admin/logout', {});
    window.location.href = '/admin';
  });

  // Mobile sidebar
  document.getElementById('sidebar-toggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay')?.addEventListener('click', closeSidebar);

  // Modal close on ESC only (overlay click intentionally disabled)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  initDashboard();
  initHomepage();
  initCourses();
  initProjects();
  initReviews();
  initNews();
  initBlog();
  initMaterials();
  initPhotos();
  initFaq();
  initMessages();
  initChangePassword();

  showSection('dashboard');
});

// ── Mobile sidebar ──────────────────────────────────────────────────────────────
function toggleSidebar() {
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function initDashboard() {
  loaders.dashboard = loadStats;

  document.querySelectorAll('.stat-card.stat-nav[data-section]').forEach(card => {
    card.addEventListener('click', () => showSection(card.dataset.section));
  });
}

async function loadStats() {
  try {
    const s = await API.get('/api/admin/stats');
    setText(document.getElementById('stat-courses'),     s.courses);
    setText(document.getElementById('stat-reviews'),     s.reviews);
    setText(document.getElementById('stat-messages'),    s.messages);
    setText(document.getElementById('stat-unread'),      s.unread);
    setText(document.getElementById('stat-news'),        s.news);
    setText(document.getElementById('stat-faq'),         s.faq);
    setText(document.getElementById('stat-blog'),        s.blog);
    setText(document.getElementById('stat-photos'),      s.photos);
    setText(document.getElementById('stat-projects'),    s.projects);
    setText(document.getElementById('stat-materials'),   s.materials ?? '—');

    const badge = document.querySelector('.nav-item[data-section="messages"] .nav-badge');
    if (badge) {
      badge.textContent = s.unread;
      badge.style.display = s.unread ? 'inline' : 'none';
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COURSES
// ═══════════════════════════════════════════════════════════════════════════════
const COURSE_STATUS_LABELS = {
  open:     'Набор открыт',
  ongoing:  'Курс идёт',
  finished: 'Курс закончился',
  upcoming: 'Скоро',
  custom:   'Свой статус',
  closed:   'Запись закрыта',
};

let _editingCourseId = null;

function initCourses() {
  loaders.courses = loadCourses;

  document.getElementById('btn-add-course')?.addEventListener('click', () => {
    _editingCourseId = null;
    resetCourseForm();
    document.getElementById('course-modal-title').textContent = 'Добавить курс';
    openModal('modal-course');
  });

  document.getElementById('course-form')?.addEventListener('submit', saveCourse);

  // Показывать поле "название тега" только для статуса "custom"
  document.getElementById('status-inp')?.addEventListener('change', function () {
    const wrap = document.getElementById('custom-status-wrap');
    if (wrap) wrap.style.display = this.value === 'custom' ? 'block' : 'none';
  });

  // Динамический текст тоггла записи + показ поля ссылки
  const enrollInp = document.getElementById('enrollment-open-inp');
  const enrollText = document.getElementById('enrollment-toggle-text');
  const enrollLinkWrap = document.getElementById('enrollment-link-wrap');
  enrollInp?.addEventListener('change', () => {
    if (enrollText) enrollText.textContent = enrollInp.checked ? 'Кнопка записи активна' : 'Кнопка записи неактивна';
    if (enrollLinkWrap) enrollLinkWrap.style.display = enrollInp.checked ? 'block' : 'none';
  });

  // Скрыть поле суммы если выбрано "Бесплатно"
  document.querySelectorAll('input[name="price_type"]').forEach(r => {
    r.addEventListener('change', () => {
      const wrap = document.getElementById('price-amount-wrap');
      if (wrap) wrap.style.display = r.value === 'free' ? 'none' : 'block';
    });
  });
}

async function loadCourses() {
  const tbody = document.querySelector('#courses-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Загрузка…</td></tr>';
  try {
    const courses = await API.get('/api/courses');
    renderCoursesTable(courses);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderCoursesTable(courses) {
  const tbody = document.querySelector('#courses-table tbody');
  if (!tbody) return;

  if (!courses.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Курсов нет. Добавьте первый!</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  courses.forEach(c => {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    tr.setAttribute('draggable', 'true');

    tr.innerHTML = `
      <td class="td-drag" title="Перетащить для сортировки">⠿</td>
      <td><strong></strong></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td class="td-actions"></td>`;

    tr.querySelector('td:nth-child(2) strong').textContent = c.title;

    const descEl = tr.querySelector('td:nth-child(3)');
    descEl.style.maxWidth = '220px';
    descEl.style.overflow = 'hidden';
    descEl.style.textOverflow = 'ellipsis';
    descEl.style.whiteSpace = 'nowrap';
    descEl.style.color = '#64748b';
    descEl.style.fontSize = '.82rem';
    descEl.textContent = c.description || '—';
    descEl.title = c.description || '';

    tr.querySelector('td:nth-child(4)').textContent = c.age_range;

    const priceEl = tr.querySelector('td:nth-child(5)');
    priceEl.style.fontSize = '.82rem';
    priceEl.style.color = '#64748b';
    if (c.is_free) {
      priceEl.textContent = 'Бесплатно';
    } else if (c.price_month) {
      const suffix = c.price_type === 'course' ? '/зан.' : '/мес.';
      priceEl.textContent = Number(c.price_month).toLocaleString('ru-RU') + ' ₽' + suffix;
    } else {
      priceEl.textContent = '—';
    }

    const badgeEl = tr.querySelector('td:nth-child(6)');
    const label = c.status === 'custom'
      ? (c.custom_status_label || 'Свой статус')
      : (COURSE_STATUS_LABELS[c.status] || c.status);
    badgeEl.innerHTML = `<span class="badge badge-${c.status}">${label}</span>`;

    const actions = tr.querySelector('.td-actions');

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-ghost';
    editBtn.textContent = 'Изменить';
    editBtn.addEventListener('click', () => editCourse(c));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = 'Удалить';
    delBtn.addEventListener('click', () => deleteCourse(c.id, c.title));

    actions.append(editBtn, delBtn);
    tbody.appendChild(tr);
  });

  initCoursesDrag(tbody);
}

// ── Общая утилита drag-to-reorder для таблиц ──────────────────────────────────
// rowSel  — CSS-селектор перетаскиваемых строк (должны иметь data-id)
// onMove  — (src, target, before) — как перемещать строки; по умолчанию простая вставка
function initTableDrag(tbody, reorderUrl, rowSel = 'tr[data-id]', onMove = null, stopProp = false) {
  let dragSrc = null;

  tbody.addEventListener('dragstart', e => {
    const tr = e.target.closest(rowSel);
    if (!tr) return;
    if (stopProp) e.stopPropagation();
    dragSrc = tr;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    if (stopProp) e.stopPropagation();
    const tr = e.target.closest(rowSel);
    if (!tr || tr === dragSrc) return;
    const mid = tr.getBoundingClientRect().top + tr.getBoundingClientRect().height / 2;
    const before = e.clientY < mid;
    if (onMove) {
      onMove(dragSrc, tr, before);
    } else {
      before ? tbody.insertBefore(dragSrc, tr) : tbody.insertBefore(dragSrc, tr.nextSibling);
    }
  });

  tbody.addEventListener('dragend', async e => {
    if (stopProp) e.stopPropagation();
    if (dragSrc) dragSrc.classList.remove('dragging');
    dragSrc = null;
    const rows = [...tbody.querySelectorAll(rowSel)];
    const order = rows.map((r, i) => ({ id: Number(r.dataset.id), order: i }));
    try {
      await API.post(reorderUrl, order);
    } catch {
      toast('Не удалось сохранить порядок', 'error');
    }
  });
}

function initCoursesDrag(tbody) {
  initTableDrag(tbody, '/api/admin/courses/reorder');
}

function resetCourseForm() {
  document.getElementById('course-form')?.reset();
  const form = document.getElementById('course-form');
  if (form) {
    form.price_month.value = 0;
  }
  const wrap = document.getElementById('custom-status-wrap');
  if (wrap) wrap.style.display = 'none';
  const enrollOpenInp = document.getElementById('enrollment-open-inp');
  const enrollLinkWrap = document.getElementById('enrollment-link-wrap');
  if (enrollLinkWrap) enrollLinkWrap.style.display = enrollOpenInp?.checked ? 'block' : 'none';
  const priceAmountWrap = document.getElementById('price-amount-wrap');
  if (priceAmountWrap) priceAmountWrap.style.display = 'block';
}

function editCourse(c) {
  _editingCourseId = c.id;

  const form = document.getElementById('course-form');
  form.course_title.value        = c.title;
  form.age_range.value           = c.age_range;
  form.status.value              = c.status;
  form.course_description.value  = c.description || '';
  form.price_month.value         = c.price_month || 0;
  form.lesson_count.value        = c.lesson_count || '';
  form.dates.value               = c.dates || '';
  form.schedule.value            = c.schedule || '';
  form.custom_status_label.value = c.custom_status_label || '';

  const effectivePriceType = c.is_free ? 'free' : (c.price_type || 'month');
  form.querySelectorAll('input[name="price_type"]').forEach(r => {
    r.checked = r.value === effectivePriceType;
  });
  const priceAmountWrap = document.getElementById('price-amount-wrap');
  if (priceAmountWrap) priceAmountWrap.style.display = effectivePriceType === 'free' ? 'none' : 'block';

  const enrollInp = document.getElementById('enrollment-open-inp');
  const enrollText = document.getElementById('enrollment-toggle-text');
  const enrollLinkWrap = document.getElementById('enrollment-link-wrap');
  if (enrollInp) {
    enrollInp.checked = c.enrollment_open !== 0;
    if (enrollText) enrollText.textContent = enrollInp.checked ? 'Кнопка записи активна' : 'Кнопка записи неактивна';
    if (enrollLinkWrap) enrollLinkWrap.style.display = enrollInp.checked ? 'block' : 'none';
  }

  const enrollLinkInp = document.getElementById('enrollment-link-inp');
  if (enrollLinkInp) enrollLinkInp.value = c.enrollment_link || '';

  const wrap = document.getElementById('custom-status-wrap');
  if (wrap) wrap.style.display = c.status === 'custom' ? 'block' : 'none';

  document.getElementById('course-modal-title').textContent = 'Редактировать курс';
  openModal('modal-course');
}

async function saveCourse(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const body = {
    title:               form.course_title.value.trim(),
    age_range:           form.age_range.value.trim(),
    description:         form.course_description.value.trim(),
    status:              form.status.value,
    price_month:         Number(form.price_month.value) || 0,
    price_type:          form.elements['price_type'].value || 'month',
    lesson_count:        form.lesson_count.value.trim(),
    dates:               form.dates.value.trim(),
    schedule:            form.schedule.value.trim(),
    custom_status_label: form.custom_status_label.value.trim(),
    topics:              [],
    enrollment_open:     document.getElementById('enrollment-open-inp')?.checked ? 1 : 0,
    enrollment_link:     document.getElementById('enrollment-link-inp')?.value.trim() || '',
    is_free:             (form.elements['price_type'].value === 'free') ? 1 : 0,
  };

  try {
    if (_editingCourseId) {
      await API.put(`/api/admin/courses/${_editingCourseId}`, body);
      toast('Курс обновлён');
    } else {
      await API.post('/api/admin/courses', body);
      toast('Курс добавлен');
    }
    closeAllModals();
    loadCourses();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteCourse(id, title) {
  if (!confirmAction(`Удалить курс «${title}»?`)) return;
  try {
    await API.del(`/api/admin/courses/${id}`);
    toast('Курс удалён');
    loadCourses();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════
function initReviews() {
  loaders.reviews = loadReviews;

  document.getElementById('btn-add-review')?.addEventListener('click', () => {
    document.getElementById('review-form')?.reset();
    openModal('modal-review');
  });

  document.getElementById('review-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('[type=submit]');
    btn.disabled = true;

    const fd = new FormData();
    fd.append('name', form.review_name.value.trim());
    fd.append('text', form.review_text.value.trim());
    const img = form.review_image?.files[0];
    if (img) fd.append('image', img);

    try {
      await API.postForm('/api/admin/reviews', fd);
      toast('Отзыв добавлен');
      closeAllModals();
      loadReviews();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadReviews() {
  const tbody = document.querySelector('#reviews-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Загрузка…</td></tr>';
  try {
    const reviews = await API.get('/api/reviews');
    if (!reviews.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Отзывов нет</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    reviews.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.setAttribute('draggable', 'true');

      const dragTd = document.createElement('td');
      dragTd.className = 'td-drag';
      dragTd.title = 'Перетащить для сортировки';
      dragTd.textContent = '⠿';

      const imgTd = document.createElement('td');
      if (r.image_path) {
        const img = document.createElement('img');
        img.src = r.image_path;
        img.className = 'table-img';
        img.alt = `Скриншот отзыва от ${r.name}`;
        imgTd.appendChild(img);
      } else {
        imgTd.textContent = '—';
      }

      const nameTd = document.createElement('td');
      nameTd.textContent = r.name;

      const textTd = document.createElement('td');
      textTd.style.maxWidth = '260px';
      textTd.style.overflow = 'hidden';
      textTd.style.textOverflow = 'ellipsis';
      textTd.style.whiteSpace = 'nowrap';
      textTd.textContent = r.text;
      textTd.title = r.text;

      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(r.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteReview(r.id, r.name));
      actionsTd.appendChild(delBtn);

      tr.append(dragTd, imgTd, nameTd, textTd, dateTd, actionsTd);
      tbody.appendChild(tr);
    });
    initTableDrag(tbody, '/api/admin/reviews/reorder');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteReview(id, name) {
  if (!confirmAction(`Удалить отзыв от «${name}»?`)) return;
  try {
    await API.del(`/api/admin/reviews/${id}`);
    toast('Отзыв удалён');
    loadReviews();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEWS
// ═══════════════════════════════════════════════════════════════════════════════
let _editingNewsId = null;

function initNews() {
  loaders.news = loadNews;

  document.getElementById('btn-add-news')?.addEventListener('click', () => {
    _editingNewsId = null;
    document.getElementById('news-form')?.reset();
    document.getElementById('news-date-custom-wrap').style.display = 'none';
    document.getElementById('news-modal-title').textContent = 'Добавить новость';
    openModal('modal-news');
  });

  document.querySelectorAll('input[name="news_date_type"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('news-date-custom-wrap').style.display =
        r.value === 'custom' ? 'block' : 'none';
    });
  });

  document.getElementById('news-form')?.addEventListener('submit', saveNews);
}

async function loadNews() {
  const tbody = document.querySelector('#news-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Загрузка…</td></tr>';
  try {
    const news = await API.get('/api/news');
    if (!news.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Новостей нет</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    news.forEach(n => {
      const tr = document.createElement('tr');

      const imgTd = document.createElement('td');
      if (n.image_path) {
        const img = document.createElement('img');
        img.src = n.image_path;
        img.className = 'table-img';
        img.alt = n.title;
        imgTd.appendChild(img);
      } else {
        imgTd.textContent = '—';
      }

      const titleTd = document.createElement('td');
      titleTd.style.fontWeight = '600';
      titleTd.textContent = n.title;

      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(n.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-ghost';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => editNews(n));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteNews(n.id, n.title));

      actionsTd.append(editBtn, delBtn);
      tr.append(imgTd, titleTd, dateTd, actionsTd);
      tbody.appendChild(tr);
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function editNews(n) {
  _editingNewsId = n.id;
  const form = document.getElementById('news-form');
  form.news_title.value = n.title;
  form.news_text.value  = n.text;
  if (n.pub_date) {
    form.elements['news_date_type'].value = 'custom';
    document.getElementById('news-date-inp').value = pubDateToInput(n.pub_date);
    document.getElementById('news-date-custom-wrap').style.display = 'block';
  } else {
    form.elements['news_date_type'].value = 'today';
    document.getElementById('news-date-custom-wrap').style.display = 'none';
  }
  document.getElementById('news-modal-title').textContent = 'Редактировать новость';
  openModal('modal-news');
}

async function saveNews(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const fd = new FormData();
  fd.append('title', form.news_title.value.trim());
  fd.append('text',  form.news_text.value.trim());
  if (form.elements['news_date_type']?.value === 'custom') {
    const d = document.getElementById('news-date-inp')?.value;
    if (d) fd.append('pub_date', inputDateToDisplay(d));
  }
  const img = form.news_image?.files[0];
  if (img) fd.append('image', img);

  try {
    if (_editingNewsId) {
      await API.putForm(`/api/admin/news/${_editingNewsId}`, fd);
      toast('Новость обновлена');
    } else {
      await API.postForm('/api/admin/news', fd);
      toast('Новость добавлена');
    }
    closeAllModals();
    loadNews();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteNews(id, title) {
  if (!confirmAction(`Удалить новость «${title}»?`)) return;
  try {
    await API.del(`/api/admin/news/${id}`);
    toast('Новость удалена');
    loadNews();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTS + LECTURES
// ═══════════════════════════════════════════════════════════════════════════════
let _editingProjectId  = null;
let _editingLectureId  = null;
let _lectureProjectId  = null;

const LECT_STATUS_LABELS = {
  open:     'Набор открыт',
  finished: 'Завершена',
  upcoming: 'Скоро',
  custom:   'Свой статус',
  closed:   'Запись закрыта',
};

function initProjects() {
  loaders.projects = loadProjects;

  document.getElementById('btn-add-project')?.addEventListener('click', () => {
    _editingProjectId = null;
    document.getElementById('project-form')?.reset();
    document.getElementById('project-modal-title-adm').textContent = 'Добавить проект';
    openModal('modal-project');
  });

  document.getElementById('project-form')?.addEventListener('submit', saveProject);

  // Лекционная форма — события
  document.getElementById('lect-status-inp')?.addEventListener('change', function () {
    const wrap = document.getElementById('lect-custom-status-wrap');
    if (wrap) wrap.style.display = this.value === 'custom' ? 'block' : 'none';
  });

  const lectEnrollInp     = document.getElementById('lect-enrollment-open-inp');
  const lectEnrollText    = document.getElementById('lect-enrollment-toggle-text');
  const lectEnrollLink    = document.getElementById('lect-enrollment-link-wrap');
  const lectEventTypeWrap = document.getElementById('lect-event-type-wrap');
  const _updateLectEnroll = () => {
    const on = lectEnrollInp.checked;
    if (lectEnrollText)    lectEnrollText.textContent = on ? 'Кнопка записи активна' : 'Кнопка записи неактивна';
    if (lectEnrollLink)    lectEnrollLink.style.display    = on ? 'block' : 'none';
    if (lectEventTypeWrap) lectEventTypeWrap.style.display = on ? 'block' : 'none';
  };
  lectEnrollInp?.addEventListener('change', _updateLectEnroll);

  document.querySelectorAll('input[name="lect_price_type"]').forEach(r => {
    r.addEventListener('change', () => {
      const wrap = document.getElementById('lect-price-amount-wrap');
      if (wrap) wrap.style.display = r.value === 'free' ? 'none' : 'block';
    });
  });


  document.getElementById('lect-photo-remove')?.addEventListener('click', () => {
    document.getElementById('lect-photo-current').style.display = 'none';
    document.getElementById('lect-photo-remove').dataset.remove = '1';
  });

  document.getElementById('lecture-form')?.addEventListener('submit', saveLecture);
}

async function loadProjects() {
  const tbody = document.querySelector('#projects-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Загрузка…</td></tr>';
  try {
    const items = await API.get('/api/projects');
    if (!items.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Проектов нет. Добавьте первый!</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach(p => {
      const lectCount = p.lectures ? p.lectures.length : 0;

      // ── Главная строка проекта ──────────────────────────────
      const tr = document.createElement('tr');
      tr.className = 'project-main-row';
      tr.dataset.id = p.id;
      tr.setAttribute('draggable', 'true');

      const dragTd = document.createElement('td');
      dragTd.className = 'td-drag';
      dragTd.title = 'Перетащить для сортировки';
      dragTd.textContent = '⠿';

      const titleTd = document.createElement('td');
      titleTd.innerHTML = '<strong></strong>';
      titleTd.querySelector('strong').textContent = p.title;

      const descTd = document.createElement('td');
      descTd.style.cssText = 'max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#64748b;font-size:.82rem';
      descTd.textContent = p.description || '—';
      descTd.title = p.description || '';

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-ghost';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => editProject(p));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteProject(p.id, p.title));

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn btn-sm btn-ghost';
      toggleBtn.textContent = `Лекции (${lectCount}) ▾`;
      toggleBtn.addEventListener('click', () => {
        const subRow = document.getElementById(`lectures-row-${p.id}`);
        if (!subRow) return;
        const visible = subRow.style.display !== 'none';
        subRow.style.display = visible ? 'none' : '';
        toggleBtn.textContent = visible ? `Лекции (${lectCount}) ▾` : `Лекции (${lectCount}) ▴`;
      });

      actionsTd.append(editBtn, delBtn, toggleBtn);
      tr.append(dragTd, titleTd, descTd, actionsTd);
      tbody.appendChild(tr);

      // ── Строка с лекциями (скрыта по умолчанию) ─────────────
      const subTr = document.createElement('tr');
      subTr.id = `lectures-row-${p.id}`;
      subTr.className = 'project-lectures-row';
      subTr.style.display = 'none';

      const subTd = document.createElement('td');
      subTd.colSpan = 4;

      const inner = document.createElement('div');
      inner.className = 'lectures-inner';

      const innerHeader = document.createElement('div');
      innerHeader.className = 'lectures-inner-header';
      const innerLabel = document.createElement('span');
      innerLabel.textContent = 'Лекции проекта';
      const addLectBtn = document.createElement('button');
      addLectBtn.className = 'btn btn-sm btn-primary';
      addLectBtn.textContent = '+ Добавить лекцию';
      addLectBtn.addEventListener('click', () => openAddLectureModal(p.id));
      innerHeader.append(innerLabel, addLectBtn);
      inner.appendChild(innerHeader);

      if (p.lectures && p.lectures.length) {
        const subTable = document.createElement('table');
        subTable.className = 'lectures-subtable';
        subTable.innerHTML = `
          <thead><tr>
            <th style="width:32px"></th><th>Статус</th><th>Название</th><th>Лектор</th>
            <th>Дата / время</th><th>Цена</th><th>Действия</th>
          </tr></thead>`;
        const subTbody = document.createElement('tbody');

        p.lectures.forEach(l => {
          const ltr = document.createElement('tr');
          ltr.dataset.id = l.id;
          ltr.setAttribute('draggable', 'true');
          const statusLabel = l.status === 'custom'
            ? (l.custom_status_label || 'Свой статус')
            : (LECT_STATUS_LABELS[l.status] || l.status);

          const dragTd = document.createElement('td');
          dragTd.className = 'td-drag';
          dragTd.textContent = '⠿';

          const sTd = document.createElement('td');
          sTd.innerHTML = `<span class="badge badge-${l.status}">${statusLabel}</span>`;

          const tTd = document.createElement('td');
          tTd.style.fontWeight = '600';
          tTd.textContent = l.title;

          const lTd = document.createElement('td');
          lTd.style.fontSize = '.82rem';
          lTd.textContent = l.lecturer_name || '—';

          const dTd = document.createElement('td');
          dTd.style.fontSize = '.82rem';
          dTd.style.color = '#64748b';
          dTd.textContent = l.lecture_datetime || '—';

          const pTd = document.createElement('td');
          pTd.style.fontSize = '.82rem';
          pTd.style.color = '#64748b';
          if (l.is_free) {
            pTd.textContent = 'Бесплатно';
          } else if (l.price) {
            pTd.textContent = Number(l.price).toLocaleString('ru-RU') + ' ₽';
          } else {
            pTd.textContent = '—';
          }

          const aTd = document.createElement('td');
          aTd.className = 'td-actions';
          const lEditBtn = document.createElement('button');
          lEditBtn.className = 'btn btn-sm btn-ghost';
          lEditBtn.textContent = 'Изменить';
          lEditBtn.addEventListener('click', () => editLecture(l));
          const lDelBtn = document.createElement('button');
          lDelBtn.className = 'btn btn-sm btn-danger';
          lDelBtn.textContent = 'Удалить';
          lDelBtn.addEventListener('click', () => deleteLecture(l.id, l.title));
          aTd.append(lEditBtn, lDelBtn);

          ltr.append(dragTd, sTd, tTd, lTd, dTd, pTd, aTd);
          subTbody.appendChild(ltr);
        });

        subTable.appendChild(subTbody);
        inner.appendChild(subTable);
        initTableDrag(subTbody, '/api/admin/lectures/reorder', 'tr[data-id]', null, true);
      } else {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'lectures-empty';
        emptyMsg.textContent = 'Лекций пока нет. Добавьте первую!';
        inner.appendChild(emptyMsg);
      }

      subTd.appendChild(inner);
      subTr.appendChild(subTd);
      tbody.appendChild(subTr);
    });

    // Drag-to-reorder: перемещаем пару (main + sub) вместе
    initTableDrag(tbody, '/api/admin/projects/reorder', 'tr.project-main-row[data-id]',
      (src, target, before) => {
        const srcSub = src.nextElementSibling;
        const ref = before ? target : target.nextElementSibling?.nextElementSibling || null;
        if (ref) {
          tbody.insertBefore(src, ref);
          tbody.insertBefore(srcSub, ref);
        } else {
          tbody.appendChild(src);
          tbody.appendChild(srcSub);
        }
      }
    );
  } catch (e) {
    toast(e.message, 'error');
  }
}

function editProject(p) {
  _editingProjectId = p.id;
  const form = document.getElementById('project-form');
  form.proj_title.value       = p.title;
  form.proj_description.value = p.description || '';
  document.getElementById('project-modal-title-adm').textContent = 'Редактировать проект';
  openModal('modal-project');
}

async function saveProject(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const body = {
    title:       form.proj_title.value.trim(),
    description: form.proj_description.value.trim(),
  };

  try {
    if (_editingProjectId) {
      await API.put(`/api/admin/projects/${_editingProjectId}`, body);
      toast('Проект обновлён');
    } else {
      await API.post('/api/admin/projects', body);
      toast('Проект добавлен');
    }
    closeAllModals();
    loadProjects();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteProject(id, title) {
  if (!confirmAction(`Удалить проект «${title}» и все его лекции?`)) return;
  try {
    await API.del(`/api/admin/projects/${id}`);
    toast('Проект удалён');
    loadProjects();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Лекции ──────────────────────────────────────────────────────────────────────

function resetLectureForm() {
  document.getElementById('lecture-form')?.reset();
  document.getElementById('lect-custom-status-wrap').style.display = 'none';
  document.getElementById('lect-price-amount-wrap').style.display = 'block';
  document.getElementById('lect-photo-current').style.display = 'none';
  document.getElementById('lect-photo-remove').dataset.remove = '0';
  const enrollLink = document.getElementById('lect-enrollment-link-wrap');
  if (enrollLink) enrollLink.style.display = 'none';
  const enrollText = document.getElementById('lect-enrollment-toggle-text');
  if (enrollText) enrollText.textContent = 'Кнопка записи активна';
  const eventTypeWrap = document.getElementById('lect-event-type-wrap');
  if (eventTypeWrap) eventTypeWrap.style.display = 'block';
}

function openAddLectureModal(projectId) {
  _editingLectureId = null;
  _lectureProjectId = projectId;
  resetLectureForm();
  document.getElementById('lecture-project-id').value = projectId;
  document.getElementById('lecture-modal-title').textContent = 'Добавить лекцию';
  openModal('modal-lecture');
}

function editLecture(l) {
  _editingLectureId = l.id;
  _lectureProjectId = l.project_id;

  const form = document.getElementById('lecture-form');
  document.getElementById('lecture-project-id').value = l.project_id;
  form.lecturer_name.value      = l.lecturer_name || '';
  form.lecturer_bio.value       = l.lecturer_bio || '';
  form.title.value              = l.title || '';
  form.description.value        = l.description || '';
  form.lecture_datetime.value   = l.lecture_datetime || '';
  form.querySelectorAll('input[name="event_format"]').forEach(r => {
    r.checked = r.value === (l.event_format || 'online');
  });
  form.event_format_text.value  = l.event_format_text || '';
  form.event_type.value         = l.event_type || '';
  form.status.value           = l.status || 'open';
  form.custom_status_label.value = l.custom_status_label || '';

  const customWrap = document.getElementById('lect-custom-status-wrap');
  if (customWrap) customWrap.style.display = l.status === 'custom' ? 'block' : 'none';

  const priceType = l.is_free ? 'free' : 'paid';
  form.querySelectorAll('input[name="lect_price_type"]').forEach(r => {
    r.checked = r.value === priceType;
  });
  const priceWrap = document.getElementById('lect-price-amount-wrap');
  if (priceWrap) priceWrap.style.display = l.is_free ? 'none' : 'block';
  document.getElementById('lect-price-suffix-inp').value = l.price_suffix || '';
  form.price.value = l.price || 0;

  const enrollInp      = document.getElementById('lect-enrollment-open-inp');
  const enrollText     = document.getElementById('lect-enrollment-toggle-text');
  const enrollLink     = document.getElementById('lect-enrollment-link-wrap');
  const eventTypeWrap2 = document.getElementById('lect-event-type-wrap');
  if (enrollInp) {
    enrollInp.checked = l.enrollment_open !== 0;
    const on = enrollInp.checked;
    if (enrollText)     enrollText.textContent = on ? 'Кнопка записи активна' : 'Кнопка записи неактивна';
    if (enrollLink)     enrollLink.style.display     = on ? 'block' : 'none';
    if (eventTypeWrap2) eventTypeWrap2.style.display = on ? 'block' : 'none';
  }
  form.enrollment_link.value = l.enrollment_link || '';

  const photoWrap    = document.getElementById('lect-photo-current');
  const photoPreview = document.getElementById('lect-photo-preview');
  const photoRemove  = document.getElementById('lect-photo-remove');
  if (l.lecturer_photo) {
    photoPreview.src = l.lecturer_photo;
    photoWrap.style.display = 'flex';
  } else {
    photoWrap.style.display = 'none';
  }
  photoRemove.dataset.remove = '0';

  document.getElementById('lecture-modal-title').textContent = 'Редактировать лекцию';
  openModal('modal-lecture');
}

async function saveLecture(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const fd = new FormData();
  fd.append('project_id',          document.getElementById('lecture-project-id').value);
  fd.append('lecturer_name',       form.lecturer_name.value.trim());
  fd.append('lecturer_bio',        form.lecturer_bio.value.trim());
  fd.append('title',               form.title.value.trim());
  fd.append('description',         form.description.value.trim());
  fd.append('lecture_datetime',    form.lecture_datetime.value.trim());
  fd.append('event_format',        form.elements['event_format'].value);
  fd.append('event_format_text',   form.event_format_text.value.trim());
  fd.append('event_type',          form.event_type.value.trim());
  fd.append('price_suffix',        form.price_suffix.value.trim());
  fd.append('status',              form.status.value);
  fd.append('custom_status_label', form.custom_status_label.value.trim());
  const priceType = form.elements['lect_price_type'].value;
  fd.append('is_free', priceType === 'free' ? '1' : '0');
  fd.append('price',   priceType === 'free' ? '0' : (form.price.value || '0'));
  fd.append('enrollment_open', document.getElementById('lect-enrollment-open-inp').checked ? '1' : '0');
  fd.append('enrollment_link', form.enrollment_link.value.trim());

  if (document.getElementById('lect-photo-remove').dataset.remove === '1') {
    fd.append('remove_photo', '1');
  }
  const photo = form.lecturer_photo?.files[0];
  if (photo) fd.append('lecturer_photo', photo);

  try {
    if (_editingLectureId) {
      await API.putForm(`/api/admin/lectures/${_editingLectureId}`, fd);
      toast('Лекция обновлена');
    } else {
      await API.postForm('/api/admin/lectures', fd);
      toast('Лекция добавлена');
    }
    closeAllModals();
    loadProjects();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteLecture(id, title) {
  if (!confirmAction(`Удалить лекцию «${title}»?`)) return;
  try {
    await API.del(`/api/admin/lectures/${id}`);
    toast('Лекция удалена');
    loadProjects();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOG
// ═══════════════════════════════════════════════════════════════════════════════
let _editingBlogId = null;

function initBlog() {
  loaders.blog = loadBlog;

  document.getElementById('btn-add-blog')?.addEventListener('click', () => {
    _editingBlogId = null;
    document.getElementById('blog-form')?.reset();
    document.getElementById('blog-date-custom-wrap').style.display = 'none';
    document.getElementById('blog-modal-title').textContent = 'Добавить запись';
    openModal('modal-blog');
  });

  document.querySelectorAll('input[name="blog_date_type"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('blog-date-custom-wrap').style.display =
        r.value === 'custom' ? 'block' : 'none';
    });
  });

  document.getElementById('blog-form')?.addEventListener('submit', saveBlog);
}

async function loadBlog() {
  const tbody = document.querySelector('#blog-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Загрузка…</td></tr>';
  try {
    const items = await API.get('/api/blog');
    if (!items.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Записей нет</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach(n => {
      const tr = document.createElement('tr');

      const imgTd = document.createElement('td');
      if (n.image_path) {
        const img = document.createElement('img');
        img.src = n.image_path;
        img.className = 'table-img';
        img.alt = n.title;
        imgTd.appendChild(img);
      } else {
        imgTd.textContent = '—';
      }

      const titleTd = document.createElement('td');
      titleTd.style.fontWeight = '600';
      titleTd.textContent = n.title;

      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(n.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-ghost';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => editBlog(n));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteBlog(n.id, n.title));

      actionsTd.append(editBtn, delBtn);
      tr.append(imgTd, titleTd, dateTd, actionsTd);
      tbody.appendChild(tr);
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function editBlog(n) {
  _editingBlogId = n.id;
  const form = document.getElementById('blog-form');
  form.blog_title.value = n.title;
  form.blog_text.value  = n.text;
  if (n.pub_date) {
    form.elements['blog_date_type'].value = 'custom';
    document.getElementById('blog-date-inp').value = pubDateToInput(n.pub_date);
    document.getElementById('blog-date-custom-wrap').style.display = 'block';
  } else {
    form.elements['blog_date_type'].value = 'today';
    document.getElementById('blog-date-custom-wrap').style.display = 'none';
  }
  document.getElementById('blog-modal-title').textContent = 'Редактировать запись';
  openModal('modal-blog');
}

async function saveBlog(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const fd = new FormData();
  fd.append('title', form.blog_title.value.trim());
  fd.append('text',  form.blog_text.value.trim());
  if (form.elements['blog_date_type']?.value === 'custom') {
    const d = document.getElementById('blog-date-inp')?.value;
    if (d) fd.append('pub_date', inputDateToDisplay(d));
  }
  const img = form.blog_image?.files[0];
  if (img) fd.append('image', img);

  try {
    if (_editingBlogId) {
      await API.putForm(`/api/admin/blog/${_editingBlogId}`, fd);
      toast('Запись обновлена');
    } else {
      await API.postForm('/api/admin/blog', fd);
      toast('Запись добавлена');
    }
    closeAllModals();
    loadBlog();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteBlog(id, title) {
  if (!confirmAction(`Удалить запись «${title}»?`)) return;
  try {
    await API.del(`/api/admin/blog/${id}`);
    toast('Запись удалена');
    loadBlog();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════════════════════════════════════════════
function initPhotos() {
  loaders.photos = loadPhotos;

  document.getElementById('btn-add-photo')?.addEventListener('click', () => {
    const form = document.getElementById('photo-form');
    form?.reset();
    const wrap = document.getElementById('photo-date-custom-wrap');
    if (wrap) wrap.style.display = 'none';
    openModal('modal-photo');
  });

  document.querySelectorAll('input[name="photo_date_type"]').forEach(r => {
    r.addEventListener('change', () => {
      const wrap = document.getElementById('photo-date-custom-wrap');
      if (wrap) wrap.style.display = r.value === 'custom' ? 'block' : 'none';
    });
  });

  document.getElementById('photo-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('[type=submit]');
    btn.disabled = true;

    const fd = new FormData();
    fd.append('title', form.photo_title.value.trim());
    const dateType = form.elements['photo_date_type']?.value;
    if (dateType === 'custom') {
      const d = document.getElementById('photo-date-inp')?.value;
      if (d) {
        const [y, m, day] = d.split('-');
        fd.append('photo_date', `${day}.${m}.${y}`);
      }
    }
    const img = form.photo_image?.files[0];
    if (img) fd.append('image', img);

    try {
      await API.postForm('/api/admin/photos', fd);
      toast('Фото добавлено');
      closeAllModals();
      loadPhotos();
      loadStats();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadPhotos() {
  const tbody = document.querySelector('#photos-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Загрузка…</td></tr>';
  try {
    const items = await API.get('/api/photos');
    if (!items.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Фотографий нет</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach(p => {
      const tr = document.createElement('tr');

      const imgTd = document.createElement('td');
      const img = document.createElement('img');
      img.src = p.image_path;
      img.className = 'table-img';
      img.alt = p.title || 'Фото';
      imgTd.appendChild(img);

      const titleTd = document.createElement('td');
      titleTd.textContent = p.title || '—';

      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(p.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deletePhoto(p.id));
      actionsTd.appendChild(delBtn);

      tr.append(imgTd, titleTd, dateTd, actionsTd);
      tbody.appendChild(tr);
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deletePhoto(id) {
  if (!confirmAction('Удалить фото?')) return;
  try {
    await API.del(`/api/admin/photos/${id}`);
    toast('Фото удалено');
    loadPhotos();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════════════════
let _editingFaqId = null;

function initFaq() {
  loaders.faq = loadFaq;

  document.getElementById('btn-add-faq')?.addEventListener('click', () => {
    _editingFaqId = null;
    document.getElementById('faq-form')?.reset();
    document.getElementById('faq-modal-title').textContent = 'Добавить вопрос';
    openModal('modal-faq');
  });

  document.getElementById('faq-form')?.addEventListener('submit', saveFaq);
}

async function loadFaq() {
  const tbody = document.querySelector('#faq-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Загрузка…</td></tr>';
  try {
    const items = await API.get('/api/faq');
    if (!items.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="3">Вопросов нет</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.id = item.id;
      tr.setAttribute('draggable', 'true');

      const dragTd = document.createElement('td');
      dragTd.className = 'td-drag';
      dragTd.title = 'Перетащить для сортировки';
      dragTd.textContent = '⠿';

      const qTd = document.createElement('td');
      qTd.style.fontWeight = '600';
      qTd.textContent = item.question;

      const aTd = document.createElement('td');
      aTd.style.color = '#64748b';
      aTd.style.maxWidth = '300px';
      aTd.style.overflow = 'hidden';
      aTd.style.textOverflow = 'ellipsis';
      aTd.style.whiteSpace = 'nowrap';
      aTd.textContent = item.answer;
      aTd.title = item.answer;

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-ghost';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => editFaq(item));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteFaq(item.id, item.question));

      actionsTd.append(editBtn, delBtn);
      tr.append(dragTd, qTd, aTd, actionsTd);
      tbody.appendChild(tr);
    });
    initTableDrag(tbody, '/api/admin/faq/reorder');
  } catch (e) {
    toast(e.message, 'error');
  }
}

function editFaq(item) {
  _editingFaqId = item.id;
  const form = document.getElementById('faq-form');
  form.faq_question.value  = item.question;
  form.faq_answer.value    = item.answer;
  document.getElementById('faq-modal-title').textContent = 'Редактировать вопрос';
  openModal('modal-faq');
}

async function saveFaq(e) {
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('[type=submit]');
  btn.disabled = true;

  const body = {
    question:  form.faq_question.value.trim(),
    answer:    form.faq_answer.value.trim(),
  };

  try {
    if (_editingFaqId) {
      await API.put(`/api/admin/faq/${_editingFaqId}`, body);
      toast('Вопрос обновлён');
    } else {
      await API.post('/api/admin/faq', body);
      toast('Вопрос добавлен');
    }
    closeAllModals();
    loadFaq();
    loadStats();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteFaq(id, q) {
  if (!confirmAction(`Удалить вопрос «${q.substring(0, 60)}…»?`)) return;
  try {
    await API.del(`/api/admin/faq/${id}`);
    toast('Вопрос удалён');
    loadFaq();
    loadStats();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════
function initMessages() {
  loaders.messages = loadMessages;
}

async function loadMessages() {
  const container = document.getElementById('messages-list');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;color:#64748b">Загрузка…</div>';
  try {
    const messages = await API.get('/api/admin/messages');

    if (!messages.length) {
      container.innerHTML = `
        <div style="text-align:center;padding:48px;color:#64748b">
          <div style="font-size:2rem;margin-bottom:12px">📭</div>
          Сообщений нет
        </div>`;
      return;
    }

    container.innerHTML = '';
    messages.forEach(m => container.appendChild(buildMessageCard(m)));
  } catch (e) {
    toast(e.message, 'error');
  }
}

function buildMessageCard(m) {
  const card = document.createElement('div');
  card.className = 'msg-card' + (m.is_read ? '' : ' unread');

  const header = document.createElement('div');
  header.className = 'msg-header';

  const leftPart = document.createElement('div');
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.textContent = m.name;

  const contactEmojis = { telegram: '📞', vk: '📞', sms: '📞', email: '✉️' };
  const contactEmoji  = contactEmojis[m.contact_method] || '✉️';

  const email = document.createElement('div');
  email.className = 'msg-email';
  email.textContent = `${contactEmoji} ${m.email}`;
  leftPart.append(sender, email);

  const rightPart = document.createElement('div');
  rightPart.style.display = 'flex';
  rightPart.style.alignItems = 'center';
  rightPart.style.gap = '8px';

  const dateBadge = document.createElement('span');
  dateBadge.className = 'msg-date';
  dateBadge.textContent = formatDate(m.created_at);

  const statusBadge = document.createElement('span');
  statusBadge.className = `badge ${m.is_read ? 'badge-read' : 'badge-unread'}`;
  statusBadge.textContent = m.is_read ? 'Прочитано' : 'Новое';

  rightPart.append(dateBadge, statusBadge);
  header.append(leftPart, rightPart);

  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = m.message;

  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  if (!m.is_read) {
    const readBtn = document.createElement('button');
    readBtn.className = 'btn btn-sm btn-ghost';
    readBtn.textContent = '✓ Прочитано';
    readBtn.addEventListener('click', async () => {
      await API.put(`/api/admin/messages/${m.id}/read`, {});
      loadMessages();
      loadStats();
    });
    actions.appendChild(readBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-sm btn-danger';
  delBtn.textContent = 'Удалить';
  delBtn.addEventListener('click', async () => {
    if (!confirmAction(`Удалить сообщение от «${m.name}»?`)) return;
    await API.del(`/api/admin/messages/${m.id}`);
    toast('Сообщение удалено');
    loadMessages();
    loadStats();
  });
  actions.appendChild(delBtn);

  card.append(header, body, actions);
  return card;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
function initChangePassword() {
  document.getElementById('btn-change-password')?.addEventListener('click', () => {
    document.getElementById('pw-form')?.reset();
    document.getElementById('pw-alert').style.display = 'none';
    openModal('modal-pw');
  });

  document.getElementById('pw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form  = e.target;
    const btn   = form.querySelector('[type=submit]');
    const alert = document.getElementById('pw-alert');
    btn.disabled = true;

    try {
      await API.post('/api/admin/change-password', {
        old_password: form.old_password.value,
        new_password: form.new_password.value,
      });
      alert.className = 'alert alert-success';
      alert.textContent = 'Пароль изменён!';
      alert.style.display = 'block';
      form.reset();
      setTimeout(closeAllModals, 1500);
    } catch (err) {
      alert.className = 'alert alert-error';
      alert.textContent = err.message;
      alert.style.display = 'block';
    } finally {
      btn.disabled = false;
    }
  });
}

// DD.MM.YYYY → YYYY-MM-DD для <input type="date">
function pubDateToInput(str) {
  if (!str) return '';
  const [d, m, y] = str.split('.');
  return (y && m && d) ? `${y}-${m}-${d}` : '';
}
// YYYY-MM-DD → DD.MM.YYYY для сохранения
function inputDateToDisplay(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

// ── Materials ───────────────────────────────────────────────────────────────────

const FILE_TYPE_ICONS = {
  pdf:   { icon: '📄', label: 'PDF' },
  word:  { icon: '📝', label: 'Word' },
  image: { icon: '🖼️', label: 'Изображение' },
  video: { icon: '🎬', label: 'Видео' },
  file:  { icon: '📎', label: 'Файл' },
};

// Накопительный список новых файлов для загрузки
let _pendingFiles = [];

function initMaterials() {
  loaders['materials'] = loadMaterials;

  document.getElementById('btn-add-material')?.addEventListener('click', () => {
    resetMaterialForm();
    document.getElementById('material-modal-title').textContent = 'Добавить материал';
    openModal('modal-material');
  });

  document.getElementById('material-image-remove')?.addEventListener('click', () => {
    document.getElementById('material-image-current').style.display = 'none';
    document.getElementById('material-image-remove').dataset.remove = '1';
  });

  document.getElementById('material-sol-image-remove')?.addEventListener('click', () => {
    document.getElementById('material-sol-image-current').style.display = 'none';
    document.getElementById('material-sol-image-remove').dataset.remove = '1';
  });

  document.getElementById('material-files-trigger')?.addEventListener('click', () => {
    document.getElementById('material-files-inp')?.click();
  });

  // Накопление файлов: каждый раз добавляем к списку, не заменяем
  document.getElementById('material-files-inp')?.addEventListener('change', e => {
    const newFiles = Array.from(e.target.files);
    newFiles.forEach(f => {
      if (!_pendingFiles.some(p => p.name === f.name && p.size === f.size)) {
        _pendingFiles.push(f);
      }
    });
    e.target.value = '';
    renderPendingFiles();
  });

  document.getElementById('material-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await saveMaterial();
  });
}

function renderPendingFiles() {
  const wrap = document.getElementById('material-pending-files');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!_pendingFiles.length) return;
  _pendingFiles.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = 'material-file-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = '📎 ' + f.name;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      _pendingFiles.splice(idx, 1);
      renderPendingFiles();
    });
    row.append(nameSpan, delBtn);
    wrap.appendChild(row);
  });
}

function resetMaterialForm() {
  _pendingFiles = [];
  document.getElementById('material-id-inp').value = '';
  document.getElementById('material-title-inp').value = '';
  document.getElementById('material-condition-inp').value = '';
  document.getElementById('material-comment-inp').value = '';
  document.getElementById('material-solution-inp').value = '';
  document.getElementById('material-answer-inp').value = '';
  document.getElementById('material-image-inp').value = '';
  document.getElementById('material-sol-image-inp').value = '';
  document.getElementById('material-files-inp').value = '';
  document.getElementById('material-image-current').style.display = 'none';
  document.getElementById('material-image-remove').dataset.remove = '0';
  document.getElementById('material-sol-image-current').style.display = 'none';
  document.getElementById('material-sol-image-remove').dataset.remove = '0';
  document.getElementById('material-existing-files').style.display = 'none';
  document.getElementById('material-files-list').innerHTML = '';
  document.getElementById('material-pending-files').innerHTML = '';
}

async function loadMaterials() {
  const tbody = document.querySelector('#materials-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Загрузка…</td></tr>';
  try {
    const data = await API.get('/api/materials');
    tbody.innerHTML = '';
    if (!data.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Материалов пока нет</td></tr>';
      return;
    }
    data.forEach(m => {
      const tr = document.createElement('tr');
      tr.dataset.id = m.id;
      tr.setAttribute('draggable', 'true');

      const dragTd = document.createElement('td');
      dragTd.className = 'td-drag';
      dragTd.title = 'Перетащить для сортировки';
      dragTd.textContent = '⠿';

      const titleTd = document.createElement('td');
      titleTd.style.fontWeight = '600';
      titleTd.textContent = m.title;

      const filesTd = document.createElement('td');
      filesTd.textContent = m.files.length + ' файл(ов)';

      const dateTd = document.createElement('td');
      dateTd.textContent = formatDate(m.created_at);

      const actionsTd = document.createElement('td');
      actionsTd.className = 'td-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-sm btn-ghost';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', () => editMaterial(m.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', () => deleteMaterial(m.id));

      actionsTd.append(editBtn, delBtn);
      tr.append(dragTd, titleTd, filesTd, dateTd, actionsTd);
      tbody.appendChild(tr);
    });
    initTableDrag(tbody, '/api/admin/materials/reorder');
  } catch (e) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Ошибка загрузки</td></tr>';
  }
}

async function editMaterial(id) {
  try {
    const all = await API.get('/api/materials');
    const m = all.find(x => x.id === id);
    if (!m) return;
    resetMaterialForm();
    document.getElementById('material-id-inp').value = m.id;
    document.getElementById('material-title-inp').value = m.title || '';
    document.getElementById('material-condition-inp').value = m.condition || '';
    document.getElementById('material-comment-inp').value = m.comment || '';
    document.getElementById('material-solution-inp').value = m.solution || '';
    document.getElementById('material-answer-inp').value = m.answer || '';
    if (m.image_path) {
      document.getElementById('material-image-preview').src = m.image_path;
      document.getElementById('material-image-current').style.display = 'flex';
    }
    if (m.solution_image) {
      document.getElementById('material-sol-image-preview').src = m.solution_image;
      document.getElementById('material-sol-image-current').style.display = 'flex';
    }
    if (m.files && m.files.length) {
      const list = document.getElementById('material-files-list');
      list.innerHTML = '';
      m.files.forEach(f => {
        const icon = FILE_TYPE_ICONS[f.file_type] || FILE_TYPE_ICONS.file;
        const row = document.createElement('div');
        row.className = 'material-file-row';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = icon.icon + ' ' + f.original_name;
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-sm btn-danger';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => deleteMaterialFile(f.id, delBtn));
        row.append(nameSpan, delBtn);
        list.appendChild(row);
      });
      document.getElementById('material-existing-files').style.display = 'block';
    }
    document.getElementById('material-modal-title').textContent = 'Редактировать материал';
    openModal('modal-material');
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

async function saveMaterial() {
  const id = document.getElementById('material-id-inp').value;
  const form = document.getElementById('material-form');
  const fd = new FormData();
  fd.append('title', document.getElementById('material-title-inp').value.trim());
  fd.append('condition', document.getElementById('material-condition-inp').value.trim());
  fd.append('comment', document.getElementById('material-comment-inp').value.trim());
  fd.append('solution', document.getElementById('material-solution-inp').value.trim());
  fd.append('answer', document.getElementById('material-answer-inp').value.trim());
  const imgFile = document.getElementById('material-image-inp').files[0];
  if (imgFile) fd.append('image', imgFile);
  if (document.getElementById('material-image-remove').dataset.remove === '1') {
    fd.append('remove_image', '1');
  }
  const solImgFile = document.getElementById('material-sol-image-inp').files[0];
  if (solImgFile) fd.append('solution_image', solImgFile);
  if (document.getElementById('material-sol-image-remove').dataset.remove === '1') {
    fd.append('remove_solution_image', '1');
  }
  for (const f of _pendingFiles) fd.append('files', f);
  try {
    if (id) {
      await API.putForm(`/api/admin/materials/${id}`, fd);
    } else {
      await API.postForm('/api/admin/materials', fd);
    }
    closeAllModals();
    loadMaterials();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

async function deleteMaterial(id) {
  if (!confirm('Удалить материал?')) return;
  try {
    await API.del(`/api/admin/materials/${id}`);
    loadMaterials();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

async function deleteMaterialFile(fid, btn) {
  if (!confirm('Удалить этот файл?')) return;
  try {
    await API.del(`/api/admin/material-files/${fid}`);
    btn.closest('.material-file-row').remove();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

// ── helpers re-exported for admin context ───────────────────────────────────────
function formatDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('ru-RU', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return str; }
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

// ═══════════════════════════════════════════════════════════════════════════════
// HOMEPAGE BLOCKS
// ═══════════════════════════════════════════════════════════════════════════════

const HP_BLOCK_TYPES = {
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

const HP_BLOCK_ICONS = {
  intro:                  '🖼️',
  project_origin:         '📝',
  courses_list:           '📝',
  travel_notes:           '📝',
  my_universities:        '📝',
  philology_experience:   '📝',
  teaching_experience:    '🖼️',
  olympiad_participation: '🗂️',
  education_diplomas:     '🗂️',
};

let _hpBlocks = [];

function initHomepage() {
  loaders.homepage = loadHomepage;

  document.getElementById('hp-text-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key     = document.getElementById('hp-text-key').value;
    const title   = document.getElementById('hp-text-title-inp').value.trim();
    const content = document.getElementById('hp-text-content-inp').value.trim();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await API.put('/api/admin/homepage/' + key, { title, content });
      toast('Блок сохранён');
      closeAllModals();
      loadHomepage();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('hp-image-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key     = document.getElementById('hp-image-key').value;
    const title   = document.getElementById('hp-image-title-inp').value.trim();
    const content = document.getElementById('hp-image-content-inp').value.trim();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await API.put('/api/admin/homepage/' + key, { title, content });
      const file = document.getElementById('hp-image-file-inp').files[0];
      if (file) {
        const fd = new FormData();
        fd.append('image', file);
        await API.postForm('/api/admin/homepage/' + key + '/image', fd);
      }
      toast('Блок сохранён');
      closeAllModals();
      loadHomepage();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('hp-image-remove-btn')?.addEventListener('click', async () => {
    const key = document.getElementById('hp-image-key').value;
    if (!confirmAction('Удалить изображение?')) return;
    try {
      await API.del('/api/admin/homepage/' + key + '/image');
      toast('Изображение удалено');
      document.getElementById('hp-image-current-wrap').style.display = 'none';
      document.getElementById('hp-image-preview').src = '';
      loadHomepage();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('hp-gallery-add-btn')?.addEventListener('click', () => {
    document.getElementById('hp-gallery-files-inp').click();
  });

  document.getElementById('hp-gallery-files-inp')?.addEventListener('change', async (e) => {
    const key = document.getElementById('hp-gallery-key').value;
    const files = e.target.files;
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('images', f);
    try {
      await API.postForm('/api/admin/homepage/' + key + '/images', fd);
      toast('Фото добавлены');
      e.target.value = '';
      renderHpGalleryExisting(key, null);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  document.getElementById('hp-gallery-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key     = document.getElementById('hp-gallery-key').value;
    const title   = document.getElementById('hp-gallery-title-inp').value.trim();
    const content = document.getElementById('hp-gallery-content-inp').value.trim();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await API.put('/api/admin/homepage/' + key, { title, content });
      toast('Блок сохранён');
      closeAllModals();
      loadHomepage();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadHomepage() {
  const grid = document.getElementById('hp-blocks-grid');
  if (!grid) return;
  try {
    _hpBlocks = await API.get('/api/homepage');
    grid.innerHTML = '';
    _hpBlocks.forEach(b => {
      const card = buildHpAdminCard(b);
      grid.appendChild(card);
    });
  } catch (err) {
    toast(err.message, 'error');
  }
}

function buildHpAdminCard(b) {
  const card = document.createElement('div');
  card.className = 'hp-block-card';

  const icon = document.createElement('div');
  icon.className = 'hp-block-icon';
  icon.textContent = HP_BLOCK_ICONS[b.block_key] || '📝';

  const info = document.createElement('div');
  info.className = 'hp-block-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'hp-block-title';
  titleEl.textContent = b.title || b.block_key;

  const meta = document.createElement('div');
  meta.className = 'hp-block-meta';
  const typeLabel = { text: 'Текст', image: 'Текст + фото', gallery: 'Галерея' };
  const type = HP_BLOCK_TYPES[b.block_key] || 'text';
  let metaText = typeLabel[type];
  if (b.content) metaText += ' · ' + b.content.slice(0, 50) + (b.content.length > 50 ? '…' : '');
  else if (!b.image_path && !b.images?.length) metaText += ' · нет контента';
  if (b.images?.length) metaText += ' · ' + b.images.length + ' фото';
  if (b.image_path) metaText += ' · есть фото';
  meta.textContent = metaText;

  info.append(titleEl, meta);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-sm btn-ghost';
  editBtn.textContent = 'Редактировать';
  editBtn.addEventListener('click', () => openHpBlockModal(b));

  card.append(icon, info, editBtn);
  return card;
}

function openHpBlockModal(b) {
  const type = HP_BLOCK_TYPES[b.block_key] || 'text';

  if (type === 'text') {
    document.getElementById('hp-text-key').value = b.block_key;
    document.getElementById('hp-text-title-inp').value = b.title || '';
    document.getElementById('hp-text-content-inp').value = b.content || '';
    document.getElementById('hp-text-modal-title').textContent = b.title || 'Редактировать блок';
    openModal('modal-hp-text');

  } else if (type === 'image') {
    document.getElementById('hp-image-key').value = b.block_key;
    document.getElementById('hp-image-title-inp').value = b.title || '';
    document.getElementById('hp-image-content-inp').value = b.content || '';
    document.getElementById('hp-image-file-inp').value = '';
    document.getElementById('hp-image-modal-title').textContent = b.title || 'Редактировать блок';
    const wrap = document.getElementById('hp-image-current-wrap');
    const prev = document.getElementById('hp-image-preview');
    if (b.image_path) {
      prev.src = b.image_path;
      wrap.style.display = 'flex';
    } else {
      prev.src = '';
      wrap.style.display = 'none';
    }
    openModal('modal-hp-image');

  } else if (type === 'gallery') {
    document.getElementById('hp-gallery-key').value = b.block_key;
    document.getElementById('hp-gallery-title-inp').value = b.title || '';
    document.getElementById('hp-gallery-content-inp').value = b.content || '';
    document.getElementById('hp-gallery-modal-title').textContent = b.title || 'Редактировать блок';
    renderHpGalleryExisting(b.block_key, b.images || []);
    openModal('modal-hp-gallery');
  }
}

async function renderHpGalleryExisting(key, images) {
  const container = document.getElementById('hp-gallery-existing');
  if (!container) return;

  if (!images) {
    try {
      const blocks = await API.get('/api/homepage');
      const block = blocks.find(b => b.block_key === key);
      images = block?.images || [];
    } catch { images = []; }
  }

  container.innerHTML = '';
  if (!images.length) {
    container.innerHTML = '<div style="color:#64748b;font-size:.85rem">Фото ещё нет</div>';
    return;
  }

  const label = document.createElement('div');
  label.style.cssText = 'font-size:.85rem;font-weight:600;margin-bottom:8px;color:#475569';
  label.textContent = 'Загруженные фото (' + images.length + '):';
  container.appendChild(label);

  const grid = document.createElement('div');
  grid.className = 'hp-gallery-admin-grid';
  images.forEach(img => {
    const wrap = document.createElement('div');
    wrap.className = 'hp-gallery-admin-item';

    const el = document.createElement('img');
    el.src = img.image_path;
    el.alt = '';
    el.loading = 'lazy';
    const currentRatio = img.image_ratio || '3:2';
    el.style.aspectRatio = currentRatio.replace(':', '/');

    const controls = document.createElement('div');
    controls.className = 'hp-gallery-admin-controls';

    const ratioWrap = document.createElement('div');
    ratioWrap.className = 'hp-gallery-ratio-btns';

    ['3:2', '2:3', '3:1'].forEach(r => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hp-ratio-btn' + (currentRatio === r ? ' active' : '');
      btn.textContent = r;
      btn.addEventListener('click', async () => {
        try {
          await API.put('/api/admin/homepage/images/' + img.id, { image_ratio: r });
          ratioWrap.querySelectorAll('.hp-ratio-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          el.style.aspectRatio = r.replace(':', '/');
          img.image_ratio = r;
          loadHomepage();
        } catch (e) {
          toast(e.message, 'error');
        }
      });
      ratioWrap.appendChild(btn);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'hp-gallery-del-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Удалить';
    delBtn.addEventListener('click', async () => {
      if (!confirmAction('Удалить это фото?')) return;
      try {
        await API.del('/api/admin/homepage/images/' + img.id);
        wrap.remove();
        toast('Фото удалено');
        loadHomepage();
      } catch (e) {
        toast(e.message, 'error');
      }
    });

    controls.append(ratioWrap, delBtn);
    wrap.append(el, controls);
    grid.appendChild(wrap);
  });
  container.appendChild(grid);
}

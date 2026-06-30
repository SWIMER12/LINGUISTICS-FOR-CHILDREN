// Shared API utility for all pages

const API = {
  async _fetch(url, opts = {}) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error('Нет соединения с сервером');
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
  },

  get(url) {
    return this._fetch(url);
  },

  post(url, body) {
    return this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  postForm(url, formData) {
    return this._fetch(url, { method: 'POST', body: formData });
  },

  put(url, body) {
    return this._fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  putForm(url, formData) {
    return this._fetch(url, { method: 'PUT', body: formData });
  },

  del(url) {
    return this._fetch(url, { method: 'DELETE' });
  },
};

function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function formatDate(str) {
  if (!str) return '';
  try {
    return new Date(str).toLocaleDateString('ru-RU', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return str; }
}

// Safe DOM text setter — never use innerHTML for user content
function setText(el, text) {
  if (el) el.textContent = text ?? '';
}

// Safe multi-line display: converts \n to <br> without XSS
function setMultilineText(el, text) {
  if (!el) return;
  el.innerHTML = '';
  (text ?? '').split('\n').forEach((line, i, arr) => {
    el.appendChild(document.createTextNode(line));
    if (i < arr.length - 1) el.appendChild(document.createElement('br'));
  });
}

// ── Обрезка длинного текста (только на мобильном, ≤768px) ─────────────────────
// Текст ограничивается 7 строками, под ним появляется кнопка «Показать полностью».
// На десктопе текст всегда раскрыт, кнопка скрыта (управляется CSS-классами + замером).
function makeClampable(textEl) {
  if (!textEl) return null;
  textEl.classList.add('clamp-text');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'clamp-toggle';
  btn.textContent = 'Показать полностью';
  btn.addEventListener('click', () => {
    const expanded = textEl.classList.toggle('expanded');
    btn.textContent = expanded ? 'Свернуть' : 'Показать полностью';
  });

  // Замер после вставки в DOM и раскладки
  requestAnimationFrame(() => evalClamp(textEl, btn));
  return btn;
}

function evalClamp(textEl, btn) {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  if (!mobile) { btn.classList.remove('show'); textEl.classList.remove('is-clamped'); return; }
  // Если уже раскрыто — оставляем кнопку (для возможности свернуть), без затухания
  if (textEl.classList.contains('expanded')) {
    btn.classList.add('show');
    textEl.classList.remove('is-clamped');
    return;
  }
  // Кнопка и затухание нужны только если текст реально не помещается в ~7 строк
  const truncated = textEl.scrollHeight > textEl.clientHeight + 2;
  btn.classList.toggle('show', truncated);
  textEl.classList.toggle('is-clamped', truncated);
}

// Пересчёт при изменении размеров окна / повороте
let _clampTimer;
window.addEventListener('resize', () => {
  clearTimeout(_clampTimer);
  _clampTimer = setTimeout(() => {
    document.querySelectorAll('.clamp-text').forEach(el => {
      const btn = el.nextElementSibling;
      if (btn && btn.classList.contains('clamp-toggle')) evalClamp(el, btn);
    });
  }, 150);
});

// Анимированная «таблетка» в шапке навигации
function initNavPill() {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  const links = Array.from(navLinks.querySelectorAll('a:not(.nav-cta)'));
  if (!links.length) return;

  const activeLink = links.find(a => a.classList.contains('active'));

  const pill = document.createElement('div');
  pill.className = 'nav-pill';
  navLinks.insertBefore(pill, navLinks.firstChild);

  function positionPill(target, animate) {
    const navRect  = navLinks.getBoundingClientRect();
    const linkRect = target.getBoundingClientRect();
    if (!animate) pill.style.transition = 'none';
    pill.style.left   = (linkRect.left - navRect.left) + 'px';
    pill.style.top    = (linkRect.top  - navRect.top)  + 'px';
    pill.style.width  = linkRect.width  + 'px';
    pill.style.height = linkRect.height + 'px';
    pill.style.opacity = '1';
    if (!animate) requestAnimationFrame(() => { pill.style.transition = ''; });
  }

  // Начальное положение без анимации
  if (activeLink) positionPill(activeLink, false);

  links.forEach(link => {
    link.addEventListener('mouseenter', () => positionPill(link, true));
  });

  navLinks.addEventListener('mouseleave', () => {
    if (activeLink) positionPill(activeLink, true);
    else pill.style.opacity = '0';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const toggle = document.querySelector('.nav-toggle');
  const links  = document.querySelector('.nav-links');
  if (toggle && links) {
    const setOpen = (open) => {
      links.classList.toggle('open', open);
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!links.classList.contains('open')));
    links.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => setOpen(false))
    );
  }

  // Подсветка активного пункта меню
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (href === '/' && path === '/') ||
        (href !== '/' && path.startsWith(href))) {
      a.classList.add('active');
    }
  });

  // Запускаем анимированную таблетку после пометки активного
  initNavPill();
});

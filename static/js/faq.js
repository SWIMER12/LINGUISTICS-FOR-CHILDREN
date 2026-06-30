// Страница FAQ

let _allFaq   = [];
let _visibleCnt = 5;
const FAQ_STEP  = 3;

document.addEventListener('DOMContentLoaded', async () => {
  const list    = document.getElementById('faq-list');
  const moreBtn = document.getElementById('faq-show-more');
  if (!list) return;

  list.innerHTML = '';
  try {
    _allFaq = await API.get('/api/faq');
    renderFaq();
    injectFaqJsonLd(_allFaq);

    moreBtn?.addEventListener('click', () => {
      _visibleCnt += FAQ_STEP;
      renderFaq();
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">❓</div><div>${e.message}</div></div>`;
  }
});

// Schema.org FAQPage — расширенный сниппет с вопросами в выдаче Google
function injectFaqJsonLd(faqs) {
  if (!Array.isArray(faqs) || !faqs.length) return;
  document.getElementById('faq-jsonld')?.remove();

  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
  };

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = 'faq-jsonld';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function renderFaq() {
  const list    = document.getElementById('faq-list');
  const moreBtn = document.getElementById('faq-show-more');
  if (!list) return;

  if (!_allFaq.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">❓</div>
        <div>Вопросов пока нет</div>
      </div>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const currentCount = list.querySelectorAll('.faq-item').length;
  const toShow = _allFaq.slice(currentCount, _visibleCnt);
  toShow.forEach(item => list.appendChild(buildFaqItem(item)));

  if (moreBtn) {
    moreBtn.style.display = _visibleCnt < _allFaq.length ? 'block' : 'none';
  }
}

function buildFaqItem(item) {
  const el = document.createElement('div');
  el.className = 'faq-item';

  // Кнопка-вопрос (синяя плитка)
  const btn = document.createElement('button');
  btn.className = 'faq-q';
  btn.setAttribute('aria-expanded', 'false');

  const qText = document.createElement('span');
  setText(qText, item.question);

  const icon = document.createElement('span');
  icon.className = 'faq-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '+';

  btn.append(qText, icon);

  // Анимированный контейнер ответа
  const answerContainer = document.createElement('div');
  answerContainer.className = 'faq-a-container';

  const answer = document.createElement('div');
  answer.className = 'faq-a';
  setMultilineText(answer, item.answer);

  answerContainer.appendChild(answer);

  btn.addEventListener('click', () => {
    const isOpen = el.classList.contains('open');

    // Закрываем все открытые элементы
    document.querySelectorAll('.faq-item.open').forEach(openEl => {
      openEl.classList.remove('open');
      const q = openEl.querySelector('.faq-q');
      if (q) { q.classList.remove('open'); q.setAttribute('aria-expanded', 'false'); }
      const ac = openEl.querySelector('.faq-a-container');
      if (ac) ac.style.maxHeight = '0';
      const a = openEl.querySelector('.faq-a');
      if (a) a.style.opacity = '0';
    });

    if (!isOpen) {
      el.classList.add('open');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');

      // 1. Плавно появляется белая плитка ответа (max-height анимация)
      answerContainer.style.maxHeight = answerContainer.scrollHeight + 'px';

      // 2. После появления плитки — текст просто становится видимым
      setTimeout(() => {
        if (el.classList.contains('open')) answer.style.opacity = '1';
      }, 380);
    }
  });

  el.append(btn, answerContainer);
  return el;
}

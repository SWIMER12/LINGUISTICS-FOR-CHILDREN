(function () {
  var btn   = document.getElementById('fab-btn');
  var popup = document.getElementById('fab-popup');
  if (!btn || !popup) return;

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var opening = !popup.classList.contains('open');
    popup.classList.toggle('open', opening);
    btn.classList.toggle('open', opening);
    btn.setAttribute('aria-expanded', String(opening));
  });

  document.addEventListener('click', function (e) {
    if (!btn.contains(e.target) && !popup.contains(e.target)) {
      popup.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      popup.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  });
})();

(function () {
  function showToast(msg) {
    var el = document.createElement('div');
    el.className = 'toast toast-success';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, 1400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      resolve();
    });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-copy]');
    if (!el) return;
    e.preventDefault();
    copyText(el.dataset.copy).then(function () {
      showToast('✓ Скопировано');
    });
  });
})();

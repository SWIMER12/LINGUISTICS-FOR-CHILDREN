// Логика страницы входа в админ-панель.
// Вынесено из inline-<script> ради строгого CSP (script-src 'self').
document.addEventListener('DOMContentLoaded', async () => {
  // Already logged in?
  try {
    const res = await API.get('/api/admin/check');
    if (res.ok) window.location.href = '/admin/dashboard';
  } catch {}

  const form  = document.getElementById('login-form');
  const alert = document.getElementById('login-alert');
  const btn   = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Вход…';
    alert.style.display = 'none';

    try {
      await API.post('/api/admin/login', {
        username: form.username.value.trim(),
        password: form.password.value,
      });
      window.location.href = '/admin/dashboard';
    } catch (err) {
      alert.className = 'alert alert-error';
      alert.textContent = err.message;
      alert.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Войти';
      form.password.value = '';
      form.password.focus();
    }
  });
});

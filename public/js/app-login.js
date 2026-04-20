/**
 * app-login.js — Login page logic.
 * Handles login/register and redirects to /menu on success.
 */
(() => {
  function init() {
    // Already authenticated → skip to menu
    if (Player.getNickname() && Player.getToken()) {
      window.location.replace('/menu');
      return;
    }

    const nicknameInput = document.getElementById('nickname-input');
    const passwordInput = document.getElementById('password-input');
    const btnLogin      = document.getElementById('btn-login');
    const btnRegister   = document.getElementById('btn-register');

    function updateButtons() {
      const ok = nicknameInput.value.trim().length > 0 && passwordInput.value.length >= 1;
      btnLogin.disabled    = !ok;
      btnRegister.disabled = !ok;
    }

    nicknameInput.addEventListener('input', updateButtons);
    passwordInput.addEventListener('input', updateButtons);
    btnLogin.addEventListener('click', handleLogin);
    btnRegister.addEventListener('click', handleRegister);
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnLogin.disabled) handleLogin();
    });
    nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput.focus();
    });
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function hideError() {
    const el = document.getElementById('auth-error');
    if (el) el.style.display = 'none';
  }

  async function handleLogin() {
    const nickname = document.getElementById('nickname-input').value.trim();
    const password = document.getElementById('password-input').value;
    if (!nickname || !password) return;
    hideError();
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nickname, password }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Ошибка входа'); return; }
      Player.loginSave(data.nickname, data.token);
      window.location.href = '/menu';
    } catch {
      showError('Нет соединения с сервером');
    }
  }

  async function handleRegister() {
    const nickname = document.getElementById('nickname-input').value.trim();
    const password = document.getElementById('password-input').value;
    if (!nickname || !password) return;
    hideError();
    try {
      const res  = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nickname, password }),
      });
      const data = await res.json();
      if (!res.ok) { showError(data.error || 'Ошибка регистрации'); return; }
      Player.loginSave(data.nickname, data.token);
      window.location.href = '/menu';
    } catch {
      showError('Нет соединения с сервером');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

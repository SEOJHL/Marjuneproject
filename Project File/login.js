// Sign in / sign up / forgot password handling for index.html.

(function () {
  const tabs       = document.querySelectorAll('.auth-tabs .tab');
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const forgotForm = document.getElementById('forgotForm');
  const msgEl      = document.getElementById('authMessage');
  const forgotLink = document.getElementById('forgotPasswordLink');
  const backLink   = document.getElementById('backToSigninLink');

  // If already signed in, jump to dashboard.
  Auth.currentUser().then(u => {
    if (u && u.profile) window.location.href = 'dashboard.html';
  });

  // Tab switching
  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const which = t.dataset.tab;
      signinForm.classList.toggle('hidden', which !== 'signin');
      signupForm.classList.toggle('hidden', which !== 'signup');
      forgotForm.classList.add('hidden');
      hideMessage();
    });
  });

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    signinForm.classList.add('hidden');
    signupForm.classList.add('hidden');
    forgotForm.classList.remove('hidden');
    hideMessage();
  });

  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    forgotForm.classList.add('hidden');
    signinForm.classList.remove('hidden');
    hideMessage();
  });

  function showMessage(text, kind = 'info') {
    msgEl.textContent = text;
    msgEl.className = `auth-message ${kind}`;
    msgEl.classList.remove('hidden');
  }
  function hideMessage() {
    msgEl.classList.add('hidden');
  }

  // ---------- Sign In ----------
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    const email    = document.getElementById('signinEmail').value.trim();
    const password = document.getElementById('signinPassword').value;
    const { error } = await Auth.signIn({ email, password });
    if (error) { showMessage(error.message, 'error'); return; }
    window.location.href = 'dashboard.html';
  });

  // ---------- Sign Up ----------
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    const role     = document.getElementById('signupRole').value;
    const name     = document.getElementById('signupName').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;

    const { data, error } = await Auth.signUp({ email, password, role, name });
    if (error) { showMessage(error.message, 'error'); return; }

    if (data.session) {
      window.location.href = 'dashboard.html';
    } else {
      showMessage('Account created. Check your email for a confirmation link, then sign in.', 'success');
      signupForm.reset();
    }
  });

  // ---------- Forgot Password ----------
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    const email = document.getElementById('forgotEmail').value.trim();
    const { error } = await Auth.requestPasswordReset(email);
    if (error) { showMessage(error.message, 'error'); return; }
    showMessage('If an account exists for that email, a reset link was sent. Check your inbox.', 'success');
    forgotForm.reset();
  });
})();

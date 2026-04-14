(function() {
  const loginScreen = document.getElementById("login-screen");
  const appContainer = document.getElementById("app-container");
  const loginCard = document.getElementById("login-card");
  const setupCard = document.getElementById("setup-card");

  // Login elements
  const loginBtn = document.getElementById("login-btn");
  const loginUser = document.getElementById("login-user");
  const loginPass = document.getElementById("login-pass");
  const loginError = document.getElementById("login-error");
  const loginEye = document.getElementById("login-eye");
  const loginUserWrap = document.getElementById("login-user-wrap");
  const loginPassWrap = document.getElementById("login-pass-wrap");
  const loginForgot = document.getElementById("login-forgot");
  const rememberCheck = document.getElementById("remember-me-check");

  // Setup elements
  const setupBtn = document.getElementById("setup-btn");
  const setupPass = document.getElementById("setup-pass");
  const setupConfirm = document.getElementById("setup-confirm");
  const setupError = document.getElementById("setup-error");
  const setupPassWrap = document.getElementById("setup-pass-wrap");
  const setupConfirmWrap = document.getElementById("setup-confirm-wrap");
  const setupGreeting = document.getElementById("setup-greeting");
  const setupBackLink = document.getElementById("setup-back-link");
  const setupEye1 = document.getElementById("setup-eye-1");
  const setupEye2 = document.getElementById("setup-eye-2");

  let pendingSetupUser = "";

  // Auto-login from saved session
  (async function() {
    try {
      const session = await window.electronAPI.loadSession();
      if (session.exists) {
        rememberCheck.checked = true;
        loginUser.value = session.username;
        loginSuccess(session.name, session.username);
        return;
      }
    } catch (e) {}
    loginUser.focus();
  })();

  function clearLoginErrors() {
    loginError.textContent = "";
    loginUserWrap.classList.remove("error");
    loginPassWrap.classList.remove("error");
  }

  function clearSetupErrors() {
    setupError.textContent = "";
    setupPassWrap.classList.remove("error");
    setupConfirmWrap.classList.remove("error");
  }

  function setLoginLoading(loading) {
    if (loading) {
      loginBtn.innerHTML = '<span class="login-btn-text">Signing in</span><i class="ph ph-spinner login-btn-spinner"></i>';
      loginBtn.classList.add("loading");
      loginBtn.style.pointerEvents = "none";
    } else {
      loginBtn.innerHTML = '<span class="login-btn-text">Sign In</span><i class="ph ph-arrow-right login-btn-icon"></i>';
      loginBtn.classList.remove("loading");
      loginBtn.style.pointerEvents = "";
    }
  }

  function setSetupLoading(loading) {
    if (loading) {
      setupBtn.innerHTML = '<span class="login-btn-text">Setting up</span><i class="ph ph-spinner login-btn-spinner"></i>';
      setupBtn.style.pointerEvents = "none";
    } else {
      setupBtn.innerHTML = '<span class="login-btn-text">Set Up Account</span><i class="ph ph-arrow-right login-btn-icon"></i>';
      setupBtn.style.pointerEvents = "";
    }
  }

  function showSetupCard(username, name) {
    pendingSetupUser = username;
    setupGreeting.textContent = `Hi ${name.split(" ")[0]}! Set up your password to get started.`;
    loginCard.style.display = "none";
    setupCard.style.display = "block";
    setupPass.value = "";
    setupConfirm.value = "";
    clearSetupErrors();
    setupPass.focus();
  }

  function showLoginCard() {
    setupCard.style.display = "none";
    loginCard.style.display = "block";
    pendingSetupUser = "";
    clearLoginErrors();
    loginPass.value = "";
    loginUser.focus();
  }

  function loginSuccess(name, username, password) {
    // Remember me — save encrypted session
    if (rememberCheck.checked && password) {
      window.electronAPI.saveSession(username, password);
    } else if (!rememberCheck.checked) {
      window.electronAPI.clearSession();
    }

    appContainer.dataset.agentName = name || "";
    appContainer.dataset.agentUser = username || "";
    setTimeout(() => {
      loginScreen.classList.add("hidden");
      appContainer.style.display = "flex";
    }, 600);
  }

  async function attemptLogin() {
    clearLoginErrors();
    const user = loginUser.value.trim().toLowerCase();
    const pass = loginPass.value;

    if (!user && !pass) {
      loginUserWrap.classList.add("error");
      loginPassWrap.classList.add("error");
      loginError.textContent = "Please enter your credentials.";
      return;
    }
    if (!user) {
      loginUserWrap.classList.add("error");
      loginError.textContent = "Please enter your username.";
      loginUser.focus();
      return;
    }

    setLoginLoading(true);

    try {
      // First check if user exists and has a password
      const check = await window.electronAPI.checkUser(user);

      if (!check.exists) {
        setLoginLoading(false);
        loginUserWrap.classList.add("error");
        loginError.textContent = "User not found. Contact your administrator.";
        return;
      }

      // First-time setup: no password configured yet
      if (!check.hasPassword) {
        setLoginLoading(false);
        showSetupCard(user, check.name);
        return;
      }

      // Normal login
      if (!pass) {
        setLoginLoading(false);
        loginPassWrap.classList.add("error");
        loginError.textContent = "Please enter your password.";
        loginPass.focus();
        return;
      }

      const result = await window.electronAPI.login(user, pass);
      if (result.success) {
        loginSuccess(result.name, result.username, pass);
      } else {
        setLoginLoading(false);
        loginPassWrap.classList.add("error");
        loginError.textContent = "Invalid password.";
        loginPass.value = "";
        loginPass.focus();
      }
    } catch (err) {
      setLoginLoading(false);
      loginError.textContent = "Connection error. Please try again.";
    }
  }

  async function attemptSetup() {
    clearSetupErrors();
    const pass = setupPass.value;
    const confirm = setupConfirm.value;

    if (!pass) {
      setupPassWrap.classList.add("error");
      setupError.textContent = "Please create a password.";
      setupPass.focus();
      return;
    }
    if (pass.length < 6) {
      setupPassWrap.classList.add("error");
      setupError.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (pass !== confirm) {
      setupConfirmWrap.classList.add("error");
      setupError.textContent = "Passwords do not match.";
      return;
    }

    setSetupLoading(true);

    try {
      const result = await window.electronAPI.setupPassword(pendingSetupUser, pass);
      if (result.success) {
        rememberCheck.checked = true;
        loginSuccess(result.name, result.username, pass);
      } else {
        setSetupLoading(false);
        setupError.textContent = result.error || "Setup failed. Try again.";
      }
    } catch (err) {
      setSetupLoading(false);
      setupError.textContent = "Connection error. Please try again.";
    }
  }

  // Event listeners
  loginBtn.addEventListener("click", attemptLogin);
  setupBtn.addEventListener("click", attemptSetup);
  setupBackLink.addEventListener("click", showLoginCard);

  loginUser.addEventListener("keypress", (e) => {
    if (e.key === "Enter") { loginPass.focus(); }
  });
  loginPass.addEventListener("keypress", (e) => {
    if (e.key === "Enter") attemptLogin();
  });
  setupPass.addEventListener("keypress", (e) => {
    if (e.key === "Enter") setupConfirm.focus();
  });
  setupConfirm.addEventListener("keypress", (e) => {
    if (e.key === "Enter") attemptSetup();
  });

  loginUser.addEventListener("input", clearLoginErrors);
  loginPass.addEventListener("input", clearLoginErrors);
  setupPass.addEventListener("input", clearSetupErrors);
  setupConfirm.addEventListener("input", clearSetupErrors);

  // Eye toggles
  function setupEyeToggle(btn, input) {
    btn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.querySelector("i").className = isPassword ? "ph ph-eye-slash" : "ph ph-eye";
    });
  }

  setupEyeToggle(loginEye, loginPass);
  setupEyeToggle(setupEye1, setupPass);
  setupEyeToggle(setupEye2, setupConfirm);

  // Forgot password
  loginForgot.addEventListener("click", () => {
    loginError.style.color = "var(--tno-orange)";
    loginError.textContent = "Please contact your Team Lead or Administrator.";
    setTimeout(() => { loginError.style.color = ""; }, 3000);
  });

  // Focus handled by auto-login check above
})();

(function() {
  const loginScreen = document.getElementById("login-screen");
  const appContainer = document.getElementById("app-container");
  const loginBtn = document.getElementById("login-btn");
  const loginUser = document.getElementById("login-user");
  const loginPass = document.getElementById("login-pass");
  const loginError = document.getElementById("login-error");
  const loginEye = document.getElementById("login-eye");
  const loginUserWrap = document.getElementById("login-user-wrap");
  const loginPassWrap = document.getElementById("login-pass-wrap");
  const loginForgot = document.getElementById("login-forgot");

  function clearErrors() {
    loginError.textContent = "";
    loginUserWrap.classList.remove("error");
    loginPassWrap.classList.remove("error");
  }

  async function attemptLogin() {
    clearErrors();
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
    if (!pass) {
      loginPassWrap.classList.add("error");
      loginError.textContent = "Please enter your password.";
      loginPass.focus();
      return;
    }

    loginBtn.innerHTML = '<i class="ph ph-circle-notch" style="animation:spin 0.8s linear infinite;"></i> Signing in...';
    loginBtn.style.pointerEvents = "none";

    try {
      const result = await window.electronAPI.login(user, pass);
      if (result.success) {
        setTimeout(() => {
          loginScreen.classList.add("hidden");
          appContainer.style.display = "flex";
        }, 600);
      } else {
        loginBtn.innerHTML = 'Sign In <i class="ph ph-arrow-right"></i>';
        loginBtn.style.pointerEvents = "";
        loginUserWrap.classList.add("error");
        loginPassWrap.classList.add("error");
        loginError.textContent = "Invalid username or password.";
        loginPass.value = "";
        loginPass.focus();
      }
    } catch (err) {
      loginBtn.innerHTML = 'Sign In <i class="ph ph-arrow-right"></i>';
      loginBtn.style.pointerEvents = "";
      loginError.textContent = "Connection error. Please try again.";
    }
  }

  loginBtn.addEventListener("click", attemptLogin);
  loginUser.addEventListener("keypress", (e) => { if (e.key === "Enter") { loginPass.focus(); } });
  loginPass.addEventListener("keypress", (e) => { if (e.key === "Enter") attemptLogin(); });
  loginUser.addEventListener("input", clearErrors);
  loginPass.addEventListener("input", clearErrors);

  // Eye toggle
  loginEye.addEventListener("click", () => {
    const isPassword = loginPass.type === "password";
    loginPass.type = isPassword ? "text" : "password";
    loginEye.querySelector("i").className = isPassword ? "ph ph-eye-slash" : "ph ph-eye";
  });

  // Forgot password
  loginForgot.addEventListener("click", () => {
    loginError.style.color = "var(--tno-orange)";
    loginError.textContent = "Please contact your Team Lead or Administrator.";
    setTimeout(() => { loginError.style.color = ""; }, 3000);
  });

  // Focus username on load
  loginUser.focus();
})();

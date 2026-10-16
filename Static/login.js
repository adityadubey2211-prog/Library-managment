/* ==========================================================
   login.js: Sign In + New User (register)
   Backend contract:
     POST /signup  {username, phone, password} -> {id, message}
     POST /login   {username, phone, password} -> {id, username, message}
     errors        -> {detail: "..."}
   ========================================================== */

const BASE_URL = "";

const form = document.getElementById("login-form");
const button = document.getElementById("login-btn");
const errorBox = document.getElementById("login-error");
const okBox = document.getElementById("login-ok");
const titleEl = document.getElementById("form-title");
const hintEl = document.getElementById("form-hint");
const switchText = document.getElementById("switch-text");
const switchBtn = document.getElementById("switch-btn");
const passwordInput = document.getElementById("login-password");

let mode = "login"; // "login" or "signup"

/* If the user is already logged in, skip this page */
function alreadyLoggedIn() {
  try {
    return !!localStorage.getItem("member");
  } catch (err) {
    return false; // storage blocked: just show the form
  }
}
if (alreadyLoggedIn()) {
  window.location.href = "/";
}

/* Messages (textContent keeps them safe from HTML) */
function showError(message) {
  okBox.hidden = true;
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function showOk(message) {
  errorBox.hidden = true;
  okBox.textContent = message;
  okBox.hidden = false;
}
function hideMessages() {
  errorBox.hidden = true;
  okBox.hidden = true;
}

/* Switch between Sign In and New User */
function setMode(newMode) {
  mode = newMode;
  hideMessages();
  if (mode === "login") {
    titleEl.textContent = "Sign In";
    hintEl.textContent = "Welcome back! Enter your details.";
    button.textContent = "Sign In";
    switchText.textContent = "New user?";
    switchBtn.textContent = "Create an account";
    passwordInput.autocomplete = "current-password";
  } else {
    titleEl.textContent = "New User";
    hintEl.textContent = "Create an account to join the library.";
    button.textContent = "Create Account";
    switchText.textContent = "Already registered?";
    switchBtn.textContent = "Sign in";
    passwordInput.autocomplete = "new-password";
  }
}
switchBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

/* One helper for both API calls */
async function post(path, body) {
  let response;
  try {
    response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("Cannot reach the server. Please check your connection.");
  }

  let data = null;
  try { data = await response.json(); } catch (err) { /* no JSON body */ }

  if (!response.ok) {
    let msg = "Something went wrong.";
    if (data && typeof data.detail === "string") {
      msg = data.detail;
    } else if (data && Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) {
      msg = data.detail[0].msg; // FastAPI validation error
    }
    throw new Error(msg);
  }
  return data;
}

/* Handle the form submit */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMessages();

  const username = document.getElementById("login-username").value.trim();
  const phone = document.getElementById("login-phone").value.trim();
  const password = passwordInput.value;

  if (!username || !phone || !password) {
    showError("Please fill in all fields.");
    return;
  }

  button.disabled = true;
  try {
    if (mode === "signup") {
      await post("/signup", { username, phone, password });
      // New user created: now ask them to sign in
      passwordInput.value = "";
      setMode("login");
      showOk("Account created! Now sign in.");
    } else {
      const user = await post("/login", { username, phone, password });
      // Remember who is logged in (this browser only)
      localStorage.setItem("member", JSON.stringify({ id: user.id, name: user.username || username }));
      window.location.href = "/";
    }
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
  }
});
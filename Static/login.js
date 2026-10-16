/* ==========================================================
   login.js: sends name + phone to POST /login
   ========================================================== */

const BASE_URL = "";

const form = document.getElementById("login-form");
const button = document.getElementById("login-btn");
const errorBox = document.getElementById("login-error");

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

/* Show or hide an error message (textContent keeps it safe from HTML) */
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function hideError() {
  errorBox.textContent = "";
  errorBox.hidden = true;
}

/* Call the backend */
async function login(name, phone) {
  let response;
  try {
    response = await fetch(BASE_URL + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, phone: phone }),
    });
  } catch (err) {
    throw new Error("Cannot reach the server. Please check your connection.");
  }

  let data = null;
  try { data = await response.json(); } catch (err) { /* no JSON body */ }

  if (!response.ok) {
    const msg = data && typeof data.detail === "string" ? data.detail : "Login failed.";
    throw new Error(msg);
  }
  return data; // { id, name, message }
}

/* Handle the form submit */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const name = document.getElementById("login-name").value.trim();
  const phone = document.getElementById("login-phone").value.trim();

  if (!name || !phone) {
    showError("Please fill in both name and phone.");
    return;
  }

  button.disabled = true;
  try {
    const member = await login(name, phone);
    // Remember who is logged in (this browser only)
    localStorage.setItem("member", JSON.stringify({ id: member.id, name: member.name }));
    window.location.href = "/";
  } catch (err) {
    showError(err.message);
  } finally {
    button.disabled = false;
  }
});
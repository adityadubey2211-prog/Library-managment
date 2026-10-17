
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

let mode = "login";

/* Show error message */
function showError(message) {
  okBox.hidden = true;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

/* Show success message */
function showOk(message) {
  errorBox.hidden = true;
  okBox.textContent = message;
  okBox.hidden = false;
}

/* Hide messages */
function hideMessages() {
  errorBox.hidden = true;
  okBox.hidden = true;
}

/* Switch between Sign In and Create Account */
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

/* Switch form mode */
switchBtn.addEventListener("click", (event) => {
  event.preventDefault();

  setMode(mode === "login" ? "signup" : "login");
});

/* API request helper */
async function post(path, body) {
  let response;

  try {
    response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error(
      "Cannot reach the server. Check whether FastAPI is running."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    let message = "Something went wrong.";

    if (data && typeof data.detail === "string") {
      message = data.detail;
    } else if (
      data &&
      Array.isArray(data.detail) &&
      data.detail.length > 0
    ) {
      message = data.detail[0].msg || message;
    } else if (response.status === 404) {
      message = "API endpoint not found. Check main.py routes.";
    }

    throw new Error(message);
  }

  return data;
}

/* Handle form submission */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessages();

  if (button.disabled) {
    return;
  }

  const username = document
    .getElementById("login-username")
    .value.trim();

  const phone = document
    .getElementById("login-phone")
    .value.trim();

  const password = passwordInput.value;

  if (!username || !phone || !password) {
    showError("Please fill in all fields.");
    return;
  }

  button.disabled = true;

  try {
    if (mode === "signup") {
      await post("/signin", {
        username: username,
        phone: phone,
        password: password
      });

      passwordInput.value = "";
      setMode("login");
      showOk("Account created! Now sign in.");
    } else {
      const user = await post("/login", {
        username: username,
        phone: phone,
        password: password
      });

      // Save login information after successful login
      localStorage.setItem(
        "member",
        JSON.stringify({
          id: user.id,
          name: user.username || username
        })
      );

      // Redirect only after successful login
      window.location.replace("/");
    }
  } catch (err) {
    showError(err.message || "An unexpected error occurred.");
  } finally {
    button.disabled = false;
  }
});

/* Initialize login mode */
setMode("login");

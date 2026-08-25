const form = document.querySelector("#login-form");
const statusNode = document.querySelector("#login-status");
const submitButton = form.querySelector('button[type="submit"]');
const passwordInput = document.querySelector("#login-password");
const passwordToggle = document.querySelector("#password-toggle");
const passwordToggleIcon = passwordToggle.querySelector("img");

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

const state = await request("/api/auth/status");
if (state.authenticated) window.location.href = "/";

passwordToggle.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  passwordToggleIcon.src = shouldShow ? "/assets/icons/eye-slash.svg" : "/assets/icons/eye.svg";
  passwordToggle.setAttribute("aria-label", shouldShow ? "隐藏密码" : "显示密码");
  passwordToggle.setAttribute("aria-pressed", String(shouldShow));
  passwordInput.focus({ preventScroll: true });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusNode.hidden = true;
  const values = Object.fromEntries(new FormData(form));
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "正在登录…";
  try {
    await request("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
    window.location.href = "/";
  } catch (error) {
    statusNode.textContent = error.message;
    statusNode.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});

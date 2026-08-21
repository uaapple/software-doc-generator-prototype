const form = document.querySelector("#login-form");
const statusNode = document.querySelector("#login-status");

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "请求失败");
  return body;
}

const state = await request("/api/auth/status");
if (state.authenticated) window.location.href = "/";

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusNode.hidden = true;
  const values = Object.fromEntries(new FormData(form));
  try {
    await request("/api/auth/login", { method: "POST", body: JSON.stringify(values) });
    window.location.href = "/";
  } catch (error) {
    statusNode.textContent = error.message;
    statusNode.hidden = false;
  }
});

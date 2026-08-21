const response = await fetch("/api/auth/status");
const state = await response.json();
if (!state.authenticated) {
  window.location.href = "/login";
} else {
  let links = document.querySelector(".top-nav .nav-links");
  if (!links) {
    links = document.createElement("div");
    links.className = "nav-links";
    document.querySelector(".top-nav")?.append(links);
  }
  if (state.user.role === "admin") links.insertAdjacentHTML("beforeend", '<a class="nav-link" href="/admin">管理</a>');

  const session = document.createElement("div");
  session.className = "auth-nav-session";
  const user = document.createElement("span");
  user.className = "auth-nav-user";
  const userLabel = document.createElement("small");
  userLabel.textContent = "当前用户";
  const userName = document.createElement("strong");
  userName.textContent = state.user.displayName || state.user.username;
  user.append(userLabel, userName);

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "nav-logout-button";
  logout.textContent = "退出";
  logout.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });
  session.append(user, logout);
  links.append(session);
}

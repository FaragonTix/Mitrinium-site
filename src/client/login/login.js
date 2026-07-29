const statusElement = document.getElementById("status");
const buttonElement = document.getElementById("googleButton");

function safeReturnPath() {
  const value = new URLSearchParams(location.search).get("return") || "/editor/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/editor/";
}

function showStatus(message, error = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function finishLogin(credential) {
  showStatus("Проверяем Google-аккаунт…");
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Не удалось войти.");
  }
  location.replace(safeReturnPath());
}

async function initialize() {
  const current = await fetch("/api/auth/me");
  if (current.ok) {
    location.replace(safeReturnPath());
    return;
  }

  const configResponse = await fetch("/api/auth/config");
  const config = await configResponse.json();
  if (!config.clientId) throw new Error("Google Client ID не настроен.");

  while (!window.google?.accounts?.id) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  google.accounts.id.initialize({
    client_id: config.clientId,
    callback: ({ credential }) =>
      finishLogin(credential).catch((error) => showStatus(error.message, true)),
  });
  if (new URLSearchParams(location.search).has("switch")) {
    google.accounts.id.disableAutoSelect();
  }
  google.accounts.id.renderButton(buttonElement, {
    theme: "filled_black",
    size: "large",
    shape: "rectangular",
    text: "signin_with",
    locale: "ru",
    width: 300,
  });
  showStatus("");
}

initialize().catch((error) => showStatus(error.message, true));

(() => {
  function createRunner(successHandler, failureHandler) {
    return new Proxy(
      {},
      {
        get(_target, property) {
          if (property === "withSuccessHandler") {
            return (handler) => createRunner(handler, failureHandler);
          }

          if (property === "withFailureHandler") {
            return (handler) => createRunner(successHandler, handler);
          }

          return (...args) => {
            fetch("/api/rpc", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify({
                method: String(property),
                args,
              }),
            })
              .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (response.status === 401) {
                  const returnTo = `${location.pathname}${location.search}`;
                  location.assign(`/login/?return=${encodeURIComponent(returnTo)}`);
                  throw new Error("Переход на страницу входа…");
                }
                if (!response.ok || !payload?.ok) {
                  throw new Error(
                    payload?.error || `Ошибка сервера (${response.status}).`,
                  );
                }
                return payload.result;
              })
              .then((result) => {
                if (typeof successHandler === "function") {
                  successHandler(result);
                }
              })
              .catch((error) => {
                if (typeof failureHandler === "function") {
                  failureHandler(error);
                  return;
                }
                console.error(error);
              });
          };
        },
      },
    );
  }

  window.google = {
    script: {
      run: createRunner(),
    },
  };

  window.mitriniumLogout = async () => {
    const button = document.getElementById("logoutButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Выходим…";
    }
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      const returnTo = `${location.pathname}${location.search}`;
      location.replace(
        `/login/?return=${encodeURIComponent(returnTo)}&switch=1`,
      );
    }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const response = await fetch("/api/auth/me");
      const payload = await response.json();
      const button = document.getElementById("dashboardButton");
      if (button && response.ok && payload?.user?.isAdmin) {
        button.hidden = false;
      }
    } catch {
      // Остальной интерфейс сам обработает проблемы авторизации.
    }
  });
})();

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
})();

(function () {
  if (window.__ivWsWrapped) return;
  window.__ivWsWrapped = true;

  const _WS = window.WebSocket;
  let vivos = 0;
  window.WebSocket = new Proxy(_WS, {
    construct(target, args) {
      const socket = new target(...args);
      socket.addEventListener("open", () => {
        vivos++;
        window.postMessage(
          { type: "IV_TOOL_WS", morto: false },
          window.location.origin,
        );
      });
      socket.addEventListener("close", () => {
        vivos = Math.max(0, vivos - 1);
        if (vivos === 0) {
          window.postMessage(
            { type: "IV_TOOL_WS", morto: true },
            window.location.origin,
          );
        }
      });
      socket.addEventListener("error", () => {
        if (vivos === 0) {
          window.postMessage(
            { type: "IV_TOOL_WS", morto: true },
            window.location.origin,
          );
        }
      });
      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "poke-xp") {
            window.postMessage(
              { type: "IV_TOOL_XP", ts: Date.now() },
              window.location.origin,
            );
          }
        } catch (e) {}
      });
      return socket;
    },
  });
})();

(function () {
  if (window.__ivFetchWrapped) return;
  window.__ivFetchWrapped = true;

  const origin = window.fetch;
  window.fetch = function (...args) {
    const headers = args[1]?.headers;
    if (headers) {
      const auth =
        headers instanceof Headers
          ? headers.get("authorization")
          : headers.authorization || headers.Authorization;
      if (auth && auth !== "Bearer null") {
        window.postMessage(
          { type: "IV_TOOL_TOKEN", token: auth },
          window.location.origin,
        );
      }
    }
    return origin.apply(this, args);
  };
})();

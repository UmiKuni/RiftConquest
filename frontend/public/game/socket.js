(function () {
  const rcGame = (window.rcGame = window.rcGame || {});

  function createSocket(attachFirebaseAuthToSocket) {
    const socket =
      window.rcSocket && typeof window.rcSocket.createSocket === "function"
        ? window.rcSocket.createSocket()
        : io(window.rcBackend ? window.rcBackend.socketUrl() : undefined);
    rcGame.liveSocket = socket;
    if (typeof attachFirebaseAuthToSocket === "function") {
      attachFirebaseAuthToSocket(socket);
    }
    return socket;
  }

  rcGame.socket = {
    createSocket,
  };
})();

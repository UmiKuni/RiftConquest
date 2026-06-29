(function () {
  const rcGame = (window.rcGame = window.rcGame || {});

  function createSocket(attachFirebaseAuthToSocket) {
    const socket = io();
    if (typeof attachFirebaseAuthToSocket === "function") {
      attachFirebaseAuthToSocket(socket);
    }
    return socket;
  }

  rcGame.socket = {
    createSocket,
  };
})();

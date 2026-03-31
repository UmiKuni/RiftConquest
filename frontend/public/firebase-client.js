(function initFirebaseClient() {
  if (!window.firebase) {
    console.warn("[firebase] SDK not loaded; skipping init");
    return;
  }

  if (!window.FIREBASE_CONFIG) {
    console.warn("[firebase] FIREBASE_CONFIG missing; skipping init");
    return;
  }

  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
    }
  } catch (err) {
    console.warn("[firebase] initializeApp failed", err);
    return;
  }

  // Expose a small helper API for the rest of the vanilla client.
  const auth = firebase.auth();
  window.firebaseAuth = auth;

  let initialAuthResolved = false;
  auth.onAuthStateChanged(
    (user) => {
      window.firebaseUser = user || null;

      // Auto-create a server-backed "Guest" identity if the user isn't logged in.
      // This uses Firebase Anonymous Auth (provider enabled in Firebase console).
      if (!initialAuthResolved) {
        initialAuthResolved = true;
        if (!user) {
          auth.signInAnonymously().catch((e) => {
            console.warn("[firebase] anonymous sign-in failed", e);
          });
        }
      }
    },
    (err) => {
      console.warn("[firebase] onAuthStateChanged error", err);
    },
  );

  window.getFirebaseIdToken = async function getFirebaseIdToken(
    forceRefresh = false,
  ) {
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  };
})();

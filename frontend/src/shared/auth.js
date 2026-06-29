export function getFirebaseAuth() {
  return window.firebaseAuth || null;
}

export function getShared() {
  return window.rcShared || null;
}

export function getCurrentUser() {
  const auth = getFirebaseAuth();
  return auth ? auth.currentUser : null;
}

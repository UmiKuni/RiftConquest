import profileHtml from "../../../public/profile.html?raw";
import { fetchMatchHistory, fetchMe } from "../../shared/api.js";
import { getFirebaseAuth, getShared } from "../../shared/auth.js";
import { pageBodyHtml } from "../../shared/dom.js";
import { bindProfileEvents } from "./events.js";
import {
  renderAnalytics,
  renderMatchHistory,
  renderMe,
  setDisabled,
  setProfileMessage,
} from "./render.js";
import { profileStore } from "./store.js";

let unsubscribeAuth = null;

async function initForUser(root, user) {
  const shared = getShared();
  const isNonAnonymousAccount =
    shared && shared.isNonAnonymousAccount ? shared.isNonAnonymousAccount : null;
  const busyWith = shared && shared.busyWith ? shared.busyWith : null;

  const load = async () => {
    profileStore.setState({ user, loading: true, disabled: true });
    setProfileMessage(root, "");
    renderAnalytics(root, null, []);
    setDisabled(root, true);

    if (!isNonAnonymousAccount || !isNonAnonymousAccount(user)) {
      renderMatchHistory(root, [], {
        emptyMessage: "Please login to view your match history.",
      });
      setProfileMessage(root, "Please login to view your profile.", true);
      profileStore.setState({ loading: false, disabled: true });
      return;
    }

    renderMatchHistory(root, [], { emptyMessage: "Loading match history..." });

    try {
      const me = await fetchMe(user);
      renderMe(root, me);

      let history = [];
      let historyFailed = false;
      try {
        history = await fetchMatchHistory(user, 20);
      } catch {
        historyFailed = true;
      }

      renderMatchHistory(root, history, {
        emptyMessage: historyFailed
          ? "Failed to load match history."
          : "No matches yet.",
      });
      renderAnalytics(root, me, history);
      profileStore.setState({ me, history });
    } catch (err) {
      setProfileMessage(
        root,
        err && err.message ? String(err.message) : "Failed to load profile.",
        true,
      );
      renderMatchHistory(root, [], {
        emptyMessage: "Failed to load match history.",
      });
    } finally {
      setDisabled(root, false);
      profileStore.setState({ loading: false, disabled: false });
    }
  };

  return busyWith ? busyWith(load, "Loading profile...") : load();
}

export function mount(root, { navigate }) {
  root.innerHTML = pageBodyHtml(profileHtml);
  bindProfileEvents(root, { store: profileStore, navigate });

  const auth = getFirebaseAuth();
  if (auth) {
    unsubscribeAuth = auth.onAuthStateChanged((user) => {
      void initForUser(root, user || null);
    });
  } else {
    setDisabled(root, true);
    renderAnalytics(root, null, []);
    renderMatchHistory(root, [], { emptyMessage: "Auth unavailable." });
    setProfileMessage(root, "Auth unavailable.", true);
  }
}

export function unmount() {
  if (typeof unsubscribeAuth === "function") unsubscribeAuth();
  unsubscribeAuth = null;
}

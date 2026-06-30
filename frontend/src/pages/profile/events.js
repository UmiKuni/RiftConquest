import { saveDisplayName } from "../../shared/api.js";
import { getShared } from "../../shared/auth.js";
import { qs } from "../../shared/dom.js";
import { setDisabled, setProfileMessage } from "./render.js";

export function bindProfileEvents(root, { store, navigate }) {
  const shared = getShared();
  const sanitizeDisplayName =
    shared && shared.sanitizeDisplayName ? shared.sanitizeDisplayName : null;
  const isNonAnonymousAccount =
    shared && shared.isNonAnonymousAccount ? shared.isNonAnonymousAccount : null;
  const busyWith = shared && shared.busyWith ? shared.busyWith : null;

  const btnSave = qs(root, "#btnSaveName");
  const btnBackLobby = qs(root, "#btnBackLobby");

  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      setProfileMessage(root, "");
      const user = store.getState().user;
      if (!isNonAnonymousAccount || !isNonAnonymousAccount(user)) {
        setProfileMessage(root, "Please login to update your name.", true);
        return;
      }

      const nameInput = qs(root, "#profileNameInput");
      const raw = nameInput ? String(nameInput.value || "") : "";
      const sanitized = sanitizeDisplayName ? sanitizeDisplayName(raw) : raw;
      if (!sanitized) {
        setProfileMessage(root, "Invalid display name.", true);
        return;
      }

      setDisabled(root, true);
      try {
        const savePromise = saveDisplayName(user, sanitized);
        const savedRaw = busyWith
          ? await busyWith(savePromise, "Saving display name...")
          : await savePromise;
        const saved = sanitizeDisplayName
          ? sanitizeDisplayName(savedRaw)
          : savedRaw;
        if (nameInput) nameInput.value = saved;
        setProfileMessage(root, "Display name updated.");
      } catch (err) {
        setProfileMessage(
          root,
          err && err.message ? String(err.message) : "Failed to update display name.",
          true,
        );
      } finally {
        setDisabled(root, false);
      }
    });
  }

  if (btnBackLobby) {
    btnBackLobby.addEventListener("click", () => navigate("/play"));
  }
}

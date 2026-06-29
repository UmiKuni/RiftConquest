import { createStore } from "../../app/store.js";

export const profileStore = createStore({
  user: null,
  me: null,
  history: [],
  loading: false,
  disabled: true,
  message: "",
  isError: false,
});

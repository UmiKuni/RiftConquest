import "./shared/backend.js";
import "./shared/socketClient.js";
import { createRouter } from "./app/router.js";

const root = document.getElementById("app");

const router = createRouter({
  root,
  routes: {
    "/": () => import("./pages/home/redirect.js"),
    "/home": () => import("./pages/home/page.js"),
    "/how-to-play": () => import("./pages/how-to-play/page.js"),
    "/cards": () => import("./pages/cards/page.js"),
    "/play": () => import("./pages/lobby/page.js"),
    "/profile": () => import("./pages/profile/page.js"),
    "/game": () => import("./pages/game/page.js"),
  },
  fallback: "/home",
});

window.rcNavigate = router.navigate;

router.render();

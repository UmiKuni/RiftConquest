import { createRouter } from "./app/router.js";

const root = document.getElementById("app");

const router = createRouter({
  root,
  routes: {
    "/": () => import("./pages/lobby/page.js"),
    "/profile": () => import("./pages/profile/page.js"),
    "/game": () => import("./pages/game/page.js"),
  },
});

window.rcNavigate = router.navigate;

router.render();

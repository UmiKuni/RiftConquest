function parseRoute() {
  const url = new URL(window.location.href);
  return {
    path: url.pathname === "" ? "/" : url.pathname,
    query: url.searchParams,
    search: url.search,
  };
}

export function createRouter({ root, routes, fallback = "/" }) {
  let currentPage = null;
  let renderToken = 0;

  async function render() {
    const token = ++renderToken;
    const route = parseRoute();
    const loader = routes[route.path] || routes[fallback];
    if (!loader) return;

    const page = await loader();
    if (token !== renderToken) return;

    if (currentPage && typeof currentPage.unmount === "function") {
      currentPage.unmount();
    }

    currentPage = page;
    page.mount(root, {
      route,
      navigate,
    });
  }

  function navigate(to, { replace = false } = {}) {
    if (replace) {
      window.history.replaceState({}, "", to);
    } else {
      window.history.pushState({}, "", to);
    }
    void render();
  }

  window.addEventListener("popstate", () => {
    void render();
  });

  return { navigate, render };
}

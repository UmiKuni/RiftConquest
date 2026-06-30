import { defineConfig } from "vite";
import fs from "fs";
import path from "path";

const backendTarget = process.env.VITE_BACKEND_URL || "http://localhost:3001";

function serveStaticPrefix(prefix, dir) {
  return {
    name: `serve-${prefix.replace(/\W+/g, "-")}`,
    configureServer(server) {
      server.middlewares.use(prefix, (req, res, next) => {
        const rawUrl = req.url ? req.url.split("?")[0] : "";
        let decoded = decodeURIComponent(rawUrl).replace(/^\/+/, "");
        const cleanPrefix = prefix.replace(/^\/+/, "");
        if (decoded.startsWith(`${cleanPrefix}/`)) {
          decoded = decoded.slice(cleanPrefix.length + 1);
        }
        const filePath = path.join(dir, decoded);

        if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
          next();
          return;
        }

        fs.createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  publicDir: "public",
  plugins: [
    serveStaticPrefix("/image", path.resolve("image")),
    serveStaticPrefix("/sounds", path.resolve("sounds")),
  ],
  server: {
    port: 5173,
    proxy: {
      "/health": backendTarget,
      "/api": backendTarget,
      "/socket.io": {
        target: backendTarget,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

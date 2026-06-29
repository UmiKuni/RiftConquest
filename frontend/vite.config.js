import { defineConfig } from "vite";

const backendTarget = process.env.VITE_BACKEND_URL || "http://localhost:3001";

export default defineConfig({
  publicDir: "public",
  server: {
    port: 5173,
    proxy: {
      "/api": backendTarget,
      "/socket.io": {
        target: backendTarget,
        ws: true,
      },
      "/image": backendTarget,
      "/sounds": backendTarget,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});

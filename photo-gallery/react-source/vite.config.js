import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base is "/static/" so the built index.html references assets the same
// way Flask serves them (static_folder="static", static_url_path="/static").
export default defineConfig({
  plugins: [react()],
  base: "/static/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Keep the bundle lean — one JS and one CSS file, no source maps shipped.
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/thumb": "http://localhost:8080",
      "/full": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});

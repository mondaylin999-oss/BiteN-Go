import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  server: {
    // host:true = listen on every interface, so you can open the app from your
    // phone on the same Wi-Fi (http://<your-laptop-ip>:5173).
    host: true,
    port: 5173,
    strictPort: true,
    // ------------------------------------------------------------------
    // Dev proxy: the browser calls  <this page's address>/api/...  and Vite
    // forwards it to the backend running on THIS machine. That is what makes
    // the app work from another device without the browser having to guess
    // the API's IP address (see src/lib/api.ts).
    // Set VITE_BACKEND_URL if the API runs elsewhere.
    // ------------------------------------------------------------------
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});

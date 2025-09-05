import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Use relative asset paths so static hosting under a subpath (e.g., GitHub Pages)
  // works without needing to hardcode the repository name.
  base: "./",
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react")) return "react-vendor";
            if (id.includes("bootstrap")) return "bootstrap-vendor";
            if (id.includes("onnxruntime")) return "onnxruntime";
            if (id.includes("face-api")) return "face-api";
            if (id.includes("react-icons")) return "icons";
            return "vendor";
          }
        },
      },
    },
  },
});

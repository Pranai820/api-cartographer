import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

function copyExtensionManifest(): Plugin {
  return {
    name: "copy-extension-manifest",
    closeBundle() {
      const outDir = resolve(rootDir, "dist");
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve(rootDir, "public", "manifest.json"), resolve(outDir, "manifest.json"));
    }
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionManifest()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(rootDir, "devtools.html"),
        panel: resolve(rootDir, "panel.html"),
        popup: resolve(rootDir, "popup.html"),
        background: resolve(rootDir, "src", "background.ts")
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
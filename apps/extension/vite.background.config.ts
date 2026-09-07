import { defineConfig } from "vite";
export default defineConfig({ publicDir: "public", build: { outDir: "dist", emptyOutDir: false, rollupOptions: { input: "src/background/entry.ts", output: { format: "iife", entryFileNames: "background/serviceWorker.js", inlineDynamicImports: true } } } });

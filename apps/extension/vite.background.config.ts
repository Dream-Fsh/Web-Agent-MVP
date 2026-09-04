import { defineConfig } from "vite";
export default defineConfig({ publicDir: "public", build: { outDir: "dist", emptyOutDir: false, rollupOptions: { input: "src/background/serviceWorker.ts", output: { format: "iife", entryFileNames: "background/serviceWorker.js", inlineDynamicImports: true } } } });

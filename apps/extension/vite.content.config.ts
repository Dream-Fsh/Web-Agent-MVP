import { defineConfig } from "vite";
export default defineConfig({ publicDir: "public", build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: "src/content/entry.ts", output: { format: "iife", entryFileNames: "content/recorder.js", inlineDynamicImports: true } } } });

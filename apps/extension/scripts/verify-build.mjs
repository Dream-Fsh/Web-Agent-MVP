import { existsSync, readFileSync } from "node:fs";
for (const path of ["dist/manifest.json", "dist/page-hooks.js", "dist/content/recorder.js", "dist/background/serviceWorker.js"]) if (!existsSync(path)) throw new Error(`Missing extension artifact: ${path}`);
if (readFileSync("dist/content/recorder.js", "utf8").includes("@web-agent/")) throw new Error("Content bundle contains a workspace bare import");

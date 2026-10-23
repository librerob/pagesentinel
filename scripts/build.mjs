import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
import "./notices.mjs";
await viteBuild();
await build({
  entryPoints: { worker: "src/worker.ts", picker: "src/picker.ts" },
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome120",
  minify: true,
  legalComments: "eof",
});
await copyFile("LICENSE", "dist/LICENSE");

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { createHash } from "node:crypto";
const files = {};
async function walk(dir, prefix = "") {
  for (const file of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (file.isDirectory())
      await walk(`${dir}/${file.name}`, `${prefix}${file.name}/`);
    else
      files[`${prefix}${file.name}`] = [
        new Uint8Array(await readFile(`${dir}/${file.name}`)),
        { mtime: new Date("2026-01-01T00:00:00Z") },
      ];
  }
}
await walk("dist");
await mkdir("artifacts", { recursive: true });
const zip = zipSync(files, { level: 9 });
const { version } = JSON.parse(await readFile("dist/manifest.json", "utf8"));
await writeFile(`artifacts/pagesentinel-${version}.zip`, zip);
const digest = createHash("sha256").update(zip).digest("hex");
await writeFile(
  "artifacts/SHA256SUMS",
  `${digest}  pagesentinel-${version}.zip\n`,
);
console.log(`Packaged ${zip.length} bytes, SHA-256 ${digest}`);

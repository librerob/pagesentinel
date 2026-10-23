import { readFile, readdir, writeFile } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let text =
  "PageSentinel is GPL-3.0-or-later. The following bundled dependencies retain their upstream licenses.\n\n";
for (const [dir, pkg] of Object.entries(lock.packages)) {
  if (!dir || pkg.dev || pkg.optional) continue;
  const metadata = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
  const files = await readdir(dir);
  const license = files.find((x) =>
    /^(?:license|copying)(?:\.(?:md|txt))?$/i.test(x),
  );
  if (!license && metadata.name !== "boolbase")
    throw new Error(`Missing license for ${metadata.name}`);
  const licenseFile = license
    ? `${dir}/${license}`
    : "docs/licenses/boolbase-ISC.txt";
  text += `\n===== ${metadata.name} ${metadata.version} (${metadata.license}) =====\n\n${await readFile(licenseFile, "utf8")}\n`;
}
await writeFile("public/THIRD_PARTY_NOTICES.txt", text);
console.log("Bundled runtime license notices generated.");

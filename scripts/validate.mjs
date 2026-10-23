import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(
  manifest.version,
  JSON.parse(await readFile("package.json", "utf8")).version,
);
assert.equal(manifest.minimum_chrome_version, "120");
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.deepEqual(manifest.permissions, [
  "alarms",
  "storage",
  "notifications",
  "activeTab",
  "scripting",
]);
let total = 0,
  count = 0;
async function walk(dir) {
  for (const file of await readdir(dir, { withFileTypes: true })) {
    if (file.isDirectory()) await walk(`${dir}/${file.name}`);
    else {
      const data = await readFile(`${dir}/${file.name}`);
      total += data.length;
      count++;
      assert(!/\.map$|\.ts$|\.zip$/.test(file.name));
      if (/\.(?:js|html)$/.test(file.name)) {
        const text = data.toString();
        assert(
          !/eval\(|new Function\(|https?:\/\/[^\s"']+\.js/.test(text),
          `Remote or evaluated code: ${file.name}`,
        );
      }
    }
  }
}
await walk("dist");
assert(total < 2 * 1024 * 1024);
for (const size of [16, 32, 48, 128]) {
  const icon = await readFile(`dist/icons/${size}.png`);
  assert.equal(icon.readUInt32BE(16), size);
  assert.equal(icon.readUInt32BE(20), size);
}
console.log(
  `Valid MV3 package: ${count} files, ${total} uncompressed bytes; no mandatory host access or remote executable code.`,
);

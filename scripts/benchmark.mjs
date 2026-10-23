import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
const result = await build({
  stdin: {
    contents:
      "export {extract} from './src/core/extract.ts'; export {wordDiff} from './src/core/compare.ts'; export {defaults} from './src/core/model.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { extract, wordDiff, defaults } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
);
const html =
  "<html><body><main>" +
  Array.from(
    { length: 180 },
    (_, i) =>
      `<p>Paragraph ${i}. We retain account records for 30 days. You may request a copy of your information.</p>`,
  ).join("") +
  "</main><script>" +
  "/* inert */".repeat(3000) +
  "</script></body></html>";
const source = extract(html, defaults),
  after = source.replace("30 days", "90 days");
function sample(fn) {
  for (let i = 0; i < 10; i++) fn();
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    medianMs: Number(samples[50].toFixed(3)),
    p95Ms: Number(samples[95].toFixed(3)),
  };
}
const measured = {
  environment: `Node ${process.version}, ${process.platform}/${process.arch}`,
  fixture:
    "Synthetic 180-paragraph HTML with inert script noise; not a live-website or idle-CPU benchmark.",
  htmlBytes: Buffer.byteLength(html),
  textCharacters: source.length,
  extraction: sample(() => extract(html, defaults)),
  comparison: sample(() => wordDiff(source, after)),
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/benchmark.json",
  JSON.stringify(measured, null, 2),
);
console.log(JSON.stringify(measured, null, 2));

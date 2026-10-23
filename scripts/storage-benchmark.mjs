import "fake-indexeddb/auto";
import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
const result = await build({
  stdin: {
    contents:
      "export * from './src/core/db.ts'; export {newMonitor} from './src/core/engine.ts'; export {defaults} from './src/core/model.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const db = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
);
const text =
  "A realistic public policy paragraph with a retention period and user choices. ".repeat(
    250,
  );
const monitors = Array.from({ length: 500 }, (_, i) => ({
  ...db.newMonitor({
    ...db.defaults,
    title: `Monitor ${i}`,
    url: `https://example.com/${i}`,
  }),
  id: String(i),
  baseline: text,
  referenceText: text,
  hash: "fixture",
}));
await db.addImported(monitors);
for (const m of monitors)
  await db.commitCheck(
    m,
    {
      id: `snapshot-${m.id}`,
      monitorId: m.id,
      time: 1,
      before: "",
      after: text,
      initial: true,
      alert: false,
    },
    40,
  );
async function sample(fn) {
  await fn();
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    medianMs: Number(samples[5].toFixed(3)),
    p95Ms: Number(samples[9].toFixed(3)),
  };
}
const fullBytes = db.recordBytes(await db.monitors()),
  metadataBytes = db.recordBytes(await db.monitorMetadata());
const data = {
  environment: `Node ${process.version}, ${process.platform}/${process.arch}, fake-indexeddb`,
  fixture: { monitors: 500, baselineCharacters: text.length, snapshots: 500 },
  oldTickFullRead: await sample(() => db.monitors()),
  newTickMetadataRead: await sample(() => db.monitorMetadata()),
  oldCheckFullScanAndAccounting: await sample(async () => {
    db.recordBytes(await db.monitors());
    db.recordBytes(await db.snapshots());
  }),
  newCheckSingleMonitorCommit: await sample(() =>
    db.commitCheck(monitors[0], undefined, 40),
  ),
  readPayload: {
    fullBytes,
    metadataBytes,
    reductionPercent: Number(
      (100 * (1 - metadataBytes / fullBytes)).toFixed(2),
    ),
  },
  limitations:
    "Synthetic IndexedDB implementation in Node; relative serialization/clone workload, not Chrome disk I/O or guaranteed wall-clock performance.",
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/storage-benchmark.json",
  JSON.stringify(data, null, 2),
);
console.log(JSON.stringify(data, null, 2));
await db.closeDatabase();

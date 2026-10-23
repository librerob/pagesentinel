// Explicit development probe, never bundled or run by the extension. One bounded
// credential-free request per listed public URL; no cookies, rendering or crawl.
import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
const bundle = await build({
  stdin: {
    contents:
      "export {fetchHTML} from './src/core/network.ts'; export {extract} from './src/core/extract.ts'; export {defaults} from './src/core/model.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { fetchHTML, extract, defaults } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`
);
const pages = [
  ["Traditional HTML", "https://example.com/"],
  ["Traditional HTML", "https://info.cern.ch/"],
  ["Software releases", "https://www.python.org/downloads/"],
  ["Software package", "https://pypi.org/project/pip/"],
  ["JavaScript-heavy downloads", "https://nodejs.org/en/download"],
  ["Software releases", "https://github.com/nodejs/node/releases"],
  ["Documentation", "https://developer.chrome.com/docs/extensions/"],
  ["Documentation", "https://developer.mozilla.org/en-US/docs/Web"],
  ["News", "https://www.bbc.com/news"],
  ["News", "https://www.theguardian.com/international"],
  ["News", "https://www.npr.org/"],
  ["Job listings", "https://boards.greenhouse.io/"],
  ["Job listings", "https://jobs.lever.co/"],
  ["E-commerce", "https://www.ebay.com/"],
  ["E-commerce", "https://www.ikea.com/gb/en/"],
  ["Privacy policy", "https://policies.google.com/privacy?hl=en"],
  ["Privacy statement", "https://privacy.microsoft.com/en-us/privacystatement"],
  ["Privacy policy", "https://www.mozilla.org/en-US/privacy/websites/"],
  ["Privacy policy", "https://duckduckgo.com/privacy"],
  ["Terms and privacy", "https://signal.org/legal/"],
];
const results = [];
for (const [category, url] of pages) {
  const start = performance.now();
  let result;
  try {
    const html = await fetchHTML(url),
      text = extract(html, {
        ...defaults,
        url,
        kind: /[Pp]rivacy|Terms/.test(category) ? "policy" : "text",
      });
    result = {
      category,
      url,
      status: "Static extraction succeeded",
      characters: text.length,
    };
  } catch (error) {
    result = {
      category,
      url,
      status: "Not supported by this probe",
      reason: error instanceof Error ? error.message : "Unknown failure",
    };
  }
  result.elapsedMs = Math.round(performance.now() - start);
  results.push(result);
  console.log(
    `${result.status}: ${url}${result.characters ? ` (${result.characters} characters)` : ` — ${result.reason}`}`,
  );
}
const date = new Date().toISOString(),
  limitations =
    "One static fetch/extraction per URL using production core functions in Node, not a Chrome extension compatibility certification or repeated monitoring test. Success means readable text was extracted, not that the intended price/job appeared or that future checks will work. Failures do not establish that rendered mode would help. Redirect destinations are not inspected. Sites and network conditions change. No response bodies are retained in this report.";
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/compatibility.json",
  JSON.stringify(
    {
      date,
      environment: `Node ${process.version} ${process.platform}`,
      limitations,
      results,
    },
    null,
    2,
  ),
);
const cell = (value) =>
  String(value ?? "")
    .replace(/\|/g, "/")
    .replace(/\n/g, " ");
await writeFile(
  "docs/COMPATIBILITY.md",
  `# Public-page static compatibility sample\n\nMeasured ${date}. ${limitations}\n\n| Category | URL | Result | Details |\n| --- | --- | --- | --- |\n${results.map((r) => `| ${cell(r.category)} | ${cell(r.url)} | ${cell(r.status)} | ${cell(r.characters ? `${r.characters} extracted characters` : r.reason)} |`).join("\n")}\n\nRun explicitly with \`node scripts/compatibility.mjs\`. This command contacts the listed websites from the development machine; it is never part of ordinary monitoring, CI checks or the production package.\n`,
);

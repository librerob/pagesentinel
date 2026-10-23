import { expect, it } from "vitest";
import { defaults } from "../src/core/model";
import { extract } from "../src/core/extract";
import { evaluate } from "../src/core/compare";
import { newMonitor } from "../src/core/engine";
import { config } from "../src/core/validation";
const c = {
  ...defaults,
  kind: "items" as const,
  url: "https://example.com/jobs",
  selector: "main",
};
it("uses stable link identities so reorder/renaming does not alert but new entries do", () => {
  const baseline = extract(
      '<main><a href="/jobs/a">Engineer</a><a href="/jobs/b">Designer</a></main>',
      c,
    ),
    m = { ...newMonitor(c), baseline, hash: "good" };
  const reordered = extract(
    '<main><a href="/jobs/b">Senior designer</a><a href="/jobs/a">Engineer</a></main>',
    c,
  );
  expect(evaluate(m, reordered).alert).toBe(false);
  const added = extract(
    '<main><a href="/jobs/a">Engineer</a><a href="/jobs/c">Researcher</a></main>',
    c,
  );
  expect(evaluate(m, added).alert).toBe(true);
  expect(evaluate(newMonitor(c), added).alert).toBe(false);
});
it("rejects empty, duplicate, private, ambiguous and invalid targets visibly", () => {
  for (const html of [
    "<main></main>",
    '<main><a href="/a">A</a><a href="/a#x">A duplicate</a></main>',
    '<main><a href="http://intranet.local./a">Private</a></main>',
  ])
    expect(() => extract(html, c)).toThrow();
  expect(() =>
    extract('<main><li><a href="/a">A</a><a href="/b">B</a></li></main>', {
      ...c,
      itemSelector: "li",
    }),
  ).toThrow(/one stable/);
  expect(() => config({ ...c, selector: "" })).toThrow(/list section/);
  expect(() =>
    extract("<main><p>Text</p></main>", { ...c, itemSelector: "[" }),
  ).toThrow(/invalid/);
});

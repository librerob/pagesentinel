import { selectAll } from "css-select";
import { textContent } from "domutils";
import type { AnyNode, Element } from "domhandler";
import { MAX_TEXT, type Config } from "./model";
import { webURL } from "./validation";
export function extractItems(root: AnyNode, c: Config) {
  let elements: Element[];
  try {
    elements = selectAll<AnyNode, Element>(c.itemSelector || "a[href]", root);
  } catch {
    throw new Error(
      "The list item selector is invalid. Edit advanced settings.",
    );
  }
  if (!elements.length || elements.length > 1000)
    throw new Error(
      "Could not identify between 1 and 1,000 list entries. Select a specific list with stable links.",
    );
  const items = new Map<string, string>();
  for (const element of elements) {
    const links =
      element.name === "a" && element.attribs.href
        ? [element]
        : selectAll<AnyNode, Element>("a[href]", element);
    if (links.length !== 1)
      throw new Error(
        "Each list entry must contain one stable public link. Refine the item selector.",
      );
    const href = links[0].attribs.href;
    if (!href || href.startsWith("#"))
      throw new Error(
        "List entries need distinct document links, rather than page fragments.",
      );
    const url = webURL(new URL(href, c.url).href).href;
    const title = textContent(element).replace(/\s+/g, " ").trim();
    if (!title || items.has(url))
      throw new Error(
        "List entries have empty labels or duplicate links. Select a more specific list.",
      );
    items.set(url, title);
  }
  const result = [...items]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([url, title]) => `${url}\n${title}`)
    .join("\n\n");
  if (result.length > MAX_TEXT)
    throw new Error(
      "Selected list exceeds 120,000 characters. Select a smaller list.",
    );
  return result;
}
export function newItems(before: string, after: string) {
  const ids = new Set(before.split("\n\n").map((item) => item.split("\n")[0]));
  return after
    .split("\n\n")
    .filter((item) => item && !ids.has(item.split("\n")[0]));
}

import { parseDocument } from "htmlparser2";
import { selectAll } from "css-select";
import { removeElement, textContent } from "domutils";
import type { AnyNode } from "domhandler";
import { MAX_BYTES, MAX_TEXT, type Config } from "./model";
import { extractItems } from "./items";
export function normalize(
  text: string,
  c: Pick<Config, "ignoreNumbers" | "ignoreDates" | "ignoreText">,
): string {
  let result = text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0 ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  for (const line of c.ignoreText.split("\n").filter(Boolean))
    result = result.split(line).join("");
  if (c.ignoreDates)
    result = result.replace(
      /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?\b/g,
      "[date]",
    );
  if (c.ignoreNumbers) result = result.replace(/\d+(?:[.,]\d+)*/g, "#");
  return result.replace(/ +/g, " ").trim();
}
const block = new Set([
  "p",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "blockquote",
  "pre",
  "br",
  "hr",
]);
function readable(node: AnyNode): string {
  if (node.type === "text") return node.data;
  if (!("children" in node)) return "";
  const value = node.children.map(readable).join("");
  return "name" in node && block.has(node.name) ? `\n\n${value}\n\n` : value;
}
function passwordInput(node: AnyNode): boolean {
  return (
    "name" in node &&
    "attribs" in node &&
    node.name === "input" &&
    node.attribs.type?.toLowerCase() === "password"
  );
}
export function extract(html: string, c: Config): string {
  if (new TextEncoder().encode(html).byteLength > MAX_BYTES)
    throw new Error("Page exceeds the 2 MiB processing limit.");
  const doc = parseDocument(html);
  const title = textContent(selectAll("title", doc)[0] ?? doc).slice(0, 200);
  if (
    /^(just a moment|access denied|sign in|log in|attention required|verify you are human)/i.test(
      title.trim(),
    ) ||
    selectAll("#challenge-form, .g-recaptcha", doc).length ||
    (!c.selector && selectAll('input[type="password"]', doc).length)
  )
    throw new Error("The page requires sign-in or a human verification check.");
  if (c.selector) {
    // Check the original subtree before hidden nodes or user exclusions are removed.
    // The selected node itself may be a password input; selectAll omits its root.
    try {
      const selected = selectAll(c.selector, doc);
      if (
        selected.some(
          (node) =>
            passwordInput(node) ||
            selectAll('input[type="password"]', node).length > 0,
        )
      )
        throw new Error("The selected section requires sign-in.");
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "The selected section requires sign-in."
      )
        throw error;
      throw new Error(
        "The selected CSS selector is invalid. Select the element again.",
      );
    }
  }
  for (const node of selectAll(
    'script,style,noscript,template,svg,canvas,iframe,object,embed,head,[hidden],[aria-hidden="true"]',
    doc,
  ))
    removeElement(node);
  try {
    if (c.exclude)
      for (const node of selectAll(c.exclude, doc)) removeElement(node);
  } catch {
    throw new Error("The exclusion selector is invalid. Edit the monitor.");
  }
  let nodes;
  try {
    nodes = c.selector ? selectAll(c.selector, doc) : selectAll("body", doc);
    // Prefer one explicit document landmark for policy pages, with a full-page
    // fallback. Never silently discard sections inside the chosen document.
    if (!c.selector && c.kind === "policy") {
      for (const selector of ["main", "article", '[role="main"]']) {
        const candidates = selectAll(selector, doc);
        if (candidates.length === 1) {
          nodes = candidates;
          break;
        }
      }
    }
  } catch {
    throw new Error(
      "The selected CSS selector is invalid. Select the element again.",
    );
  }
  if (c.selector && nodes.length !== 1)
    throw new Error(
      nodes.length
        ? "The selector matches multiple elements. Select a unique element again."
        : "Selected element is missing. The page may require JavaScript or its layout changed.",
    );
  if (c.kind === "items") return extractItems(nodes[0], c);
  const result = normalize(
    (nodes.length ? nodes : [doc]).map(readable).join("\n\n"),
    c,
  );
  if (!result)
    throw new Error(
      "No readable text found. The page may require JavaScript rendering.",
    );
  if (result.length > MAX_TEXT)
    throw new Error(
      "Selected text exceeds 120,000 characters. Select a smaller section.",
    );
  return result;
}

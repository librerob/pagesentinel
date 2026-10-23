import { parseDocument } from "htmlparser2";
import { selectAll } from "css-select";
import { removeElement, textContent } from "domutils";
import type { AnyNode } from "domhandler";
import { MAX_BYTES, MAX_TEXT, type Config } from "./model";
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
export function extract(html: string, c: Config): string {
  if (new TextEncoder().encode(html).byteLength > MAX_BYTES)
    throw new Error("Page exceeds the 2 MiB processing limit.");
  const doc = parseDocument(html);
  const title = textContent(selectAll("title", doc)[0] ?? doc).slice(0, 200);
  if (
    /^(just a moment|access denied|sign in|log in|attention required|verify you are human)/i.test(
      title.trim(),
    ) ||
    selectAll('input[type="password"], #challenge-form, .g-recaptcha', doc)
      .length
  )
    throw new Error("The page requires sign-in or a human verification check.");
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

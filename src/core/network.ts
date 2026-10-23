import { MAX_BYTES } from "./model";
import { webURL } from "./validation";
export async function fetchHTML(url: string): Promise<string> {
  const safe = webURL(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(safe.href, {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? "The website blocked this check or requires sign-in."
          : `Website returned HTTP ${response.status}.`,
      );
    if (
      !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw new Error(
        "Unsupported content type. Only HTML pages are supported.",
      );
    if (Number(response.headers.get("content-length")) > MAX_BYTES)
      throw new Error("Page exceeds the 2 MiB download limit.");
    if (!response.body)
      throw new Error("The website returned an empty response.");
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Page exceeds the 2 MiB download limit.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const encoding =
      response.headers
        .get("content-type")
        ?.match(/charset=["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      throw new Error("Unsupported document encoding.");
    }
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error(
        "Check timed out after 18 seconds. Retry when the website responds.",
      );
    if (e instanceof TypeError)
      throw new Error(
        "Could not fetch the public page. Network errors and redirects are blocked; open the final page URL and try again.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

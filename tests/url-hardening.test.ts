import { describe, expect, it } from "vitest";
import { originPattern, webURL } from "../src/core/validation";

describe("public URL canonicalization", () => {
  it.each([
    "http://localhost.",
    "http://app.local.",
    "http://app.LOCALHOST.",
    "http://app.localdomain",
    "http://app.corp.",
    "http://router.home.arpa.",
    "http://intranet",
    "http://127.1",
    "http://0177.0.0.1",
    "http://0x7f000001",
    "http://2130706433",
    "http://10.1.2.3.",
    "http://[fe80::1]",
    "http://[::ffff:192.168.1.2]",
    "https://a..com",
    "https://-host.com",
    "https://host_.com",
    "https://example.com..",
    "https://user:secret@example.com",
    "file:///page",
    "javascript:alert(1)",
    "not a URL",
  ])("rejects %s", (value) => expect(() => webURL(value)).toThrow());
  it("uses one canonical public origin for fetching and permissions", () => {
    expect(webURL("https://EXAMPLE.com.:443/a?q=1#part").href).toBe(
      "https://example.com/a?q=1",
    );
    expect(originPattern("https://example.com./a")).toBe(
      "https://example.com/*",
    );
  });
  it("permits international domains after URL punycode normalization", () => {
    expect(webURL("https://bücher.de/policy").hostname).toBe(
      "xn--bcher-kva.de",
    );
    expect(() => webURL("https://app。local。/")).toThrow();
  });
});

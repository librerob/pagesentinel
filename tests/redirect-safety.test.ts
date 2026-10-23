import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHTML } from "../src/core/network";
import { pageSelection, pageURL } from "../src/core/page";
afterEach(() => vi.restoreAllMocks());
describe("redirect safety and final-tab setup", () => {
  it("rejects redirects before following and gives recovery steps", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchHTML("https://example.com/old")).rejects.toThrow(
      /paste the final address.*Monitor this page.*Select an element/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });
  it("popup setup uses the final tab URL, ignoring original and pending URLs", () => {
    const tab = {
      url: "https://example.com/final?q=2#price",
      pendingUrl: "https://example.com/original",
      originalUrl: "https://example.com/old",
    };
    expect(pageURL(tab)).toBe("https://example.com/final?q=2");
  });
  it("picker setup uses Chrome-supplied final tab metadata", () => {
    expect(
      pageSelection(
        { url: "https://example.com/final#price", title: "Final page" },
        "#price",
        "NOK 499",
      ),
    ).toEqual({
      url: "https://example.com/final",
      title: "Final page",
      selector: "#price",
      preview: "NOK 499",
    });
  });
  it.each([
    "http://127.0.0.1/final",
    "https://user:secret@example.com/final",
    "file:///private",
  ])("rejects unsafe final tab URL %s", (url) => {
    expect(() => pageURL({ url })).toThrow();
    expect(() => pageSelection({ url }, "#price", "499")).toThrow();
  });
});

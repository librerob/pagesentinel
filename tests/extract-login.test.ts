import { describe, expect, it } from "vitest";
import { extract } from "../src/core/extract";
import { defaults } from "../src/core/model";

describe("login detection scope", () => {
  const html =
    '<title>Public shop</title><main><p id="price">NOK 499</p></main><div hidden><form><input type="password"></form></div>';
  it("accepts a public selected price beside a hidden login modal", () => {
    expect(extract(html, { ...defaults, selector: "#price" })).toBe("NOK 499");
  });
  it("keeps whole-page password detection", () => {
    expect(() => extract(html, defaults)).toThrow(/sign-in/);
  });
  it.each([
    '<form id="login"><p>Sign in</p><input type="password"></form>',
    '<div id="login"><p>Sign in</p><span hidden><input type="password"></span></div>',
  ])(
    "rejects password inputs inside the selection before exclusions",
    (content) => {
      expect(() =>
        extract(content, { ...defaults, selector: "#login", exclude: "input" }),
      ).toThrow(/sign-in/);
    },
  );
  it("rejects a selected password field itself", () => {
    expect(() =>
      extract('<input id="password" type="password">', {
        ...defaults,
        selector: "#password",
      }),
    ).toThrow(/sign-in/);
  });
  it.each([
    '<title>Sign in</title><p id="price">NOK 499</p>',
    '<p id="price">NOK 499</p><form id="challenge-form"></form>',
    '<p id="price">NOK 499</p><div class="g-recaptcha"></div>',
  ])("keeps document-wide title and challenge detection", (content) => {
    expect(() => extract(content, { ...defaults, selector: "#price" })).toThrow(
      /sign-in|verification/,
    );
  });
});

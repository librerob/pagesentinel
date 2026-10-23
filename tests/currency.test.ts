import { describe, expect, it } from "vitest";
import { price } from "../src/core/compare";
describe("explicit currency labels and zero-minor-unit convention", () => {
  it.each([
    "NOK",
    "SEK",
    "DKK",
    "PLN",
    "CZK",
    "INR",
    "BRL",
    "MXN",
    "NZD",
    "SGD",
    "HKD",
    "KRW",
    "CNY",
  ])("recognizes %s without guessing its symbol", (code) => {
    expect(price(`${code} 499`)).toEqual({ value: 499, currency: code });
  });
  it.each([
    ["kr 1 299,00", 1299, "kr"],
    ["499 kr", 499, "kr"],
    ["499 kr.", 499, "kr"],
    ["kr 1.299,-", 1299, "kr"],
    ["NOK 1.299,-", 1299, "NOK"],
    ["499,- kr", 499, "kr"],
  ] as const)("parses %s conservatively", (text, value, currency) =>
    expect(price(text)).toEqual({ value, currency }),
  );
  it.each([
    "1.299,-",
    "NOK 499 SEK",
    "NOK 1.299",
    "kr 1,299",
    "NOK 499 kr",
    "NOK 499 NOK",
    "BROKEN 499",
    "NOK 499 50",
  ])("rejects missing/duplicate labels or ambiguity in %s", (text) => {
    expect(() => price(text)).toThrow();
  });
});

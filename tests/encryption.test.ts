import { expect, it } from "vitest";
import { decryptBackup, encryptBackup } from "../src/core/encryption";
const passphrase = "A long unique backup passphrase";
it("round-trips Unicode backup data and uses fresh salts and nonces for every export", async () => {
  const data = {
    version: 1,
    monitors: [{ title: "Personvern 🔒", text: "We retain data for 30 days." }],
    largeText: "Policy paragraph. ".repeat(5000),
  };
  const a = await encryptBackup(data, passphrase),
    b = await encryptBackup(data, passphrase);
  expect(await decryptBackup(a, passphrase)).toEqual(data);
  expect(a.salt).not.toBe(b.salt);
  expect(a.iv).not.toBe(b.iv);
  expect(a.ciphertext).not.toBe(b.ciphertext);
  expect(JSON.stringify(a)).not.toContain("Personvern");
  expect(JSON.stringify(a)).not.toContain(passphrase);
});
it("rejects wrong passphrases and altered ciphertext without yielding any data", async () => {
  const a = await encryptBackup({ version: 1, monitors: [] }, passphrase);
  await expect(decryptBackup(a, "Incorrect passphrase")).rejects.toThrow(
    /incorrect|damaged/,
  );
  const changed = (a.ciphertext[0] === "A" ? "B" : "A") + a.ciphertext.slice(1);
  await expect(
    decryptBackup({ ...a, ciphertext: changed }, passphrase),
  ).rejects.toThrow(/incorrect|damaged/);
});
it("rejects attacker-controlled KDF cost, malformed salts/nonces, and unsupported versions", async () => {
  const a = await encryptBackup({}, passphrase);
  for (const extra of [
    { iterations: 2147483647 },
    { version: 2 },
    { salt: "AA==" },
    { iv: "bad!" },
    { cipher: "AES-CBC" },
  ])
    await expect(
      decryptBackup({ ...a, ...extra }, passphrase),
    ).rejects.toThrow();
  await expect(encryptBackup({}, "short")).rejects.toThrow(/12 characters/);
});

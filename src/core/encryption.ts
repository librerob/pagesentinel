// Backup-only encryption. Keys/passphrases are never persisted. IndexedDB itself
// remains plaintext. The fixed envelope/KDF bounds reject attacker-chosen work.
const iterations = 600_000;
const maxPlaintext = 64 * 1024 * 1024;
const header = "PageSentinel backup v1 / PBKDF2-SHA256 / AES-256-GCM";
const encoder = new TextEncoder();
export interface EncryptedBackup {
  format: "pagesentinel-encrypted";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
}
function encode(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 24576)
    result += btoa(String.fromCharCode(...bytes.subarray(i, i + 24576)));
  return result;
}
function decode(value: unknown, size?: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil((maxPlaintext + 16) / 3) * 4 ||
    value.length % 4 !== 0 ||
    /[^A-Za-z0-9+/]/.test(value.replace(/={1,2}$/, ""))
  )
    throw new Error("Malformed encrypted backup.");
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (
    (size !== undefined && bytes.length !== size) ||
    bytes.length > maxPlaintext + 16
  )
    throw new Error("Malformed encrypted backup.");
  return bytes;
}
async function key(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (!passphrase || passphrase.length > 1024)
    throw new Error("Enter a backup passphrase of at most 1,024 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(
  data: unknown,
  passphrase: string,
): Promise<EncryptedBackup> {
  if (passphrase.length < 12)
    throw new Error(
      "Use a passphrase with at least 12 characters. Keep it somewhere safe; it cannot be recovered.",
    );
  const plaintext = encoder.encode(JSON.stringify(data));
  if (plaintext.byteLength > maxPlaintext)
    throw new Error("Backup exceeds the 64 MiB encryption limit.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(header),
      tagLength: 128,
    },
    await key(passphrase, salt),
    plaintext,
  );
  plaintext.fill(0);
  return {
    format: "pagesentinel-encrypted",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    cipher: "AES-256-GCM",
    salt: encode(salt),
    iv: encode(iv),
    ciphertext: encode(new Uint8Array(ciphertext)),
  };
}
export async function decryptBackup(
  input: unknown,
  passphrase: string,
): Promise<unknown> {
  if (!input || typeof input !== "object")
    throw new Error("Malformed encrypted backup.");
  const x = input as Record<string, unknown>;
  if (
    x.format !== "pagesentinel-encrypted" ||
    x.version !== 1 ||
    x.kdf !== "PBKDF2-SHA256" ||
    x.iterations !== iterations ||
    x.cipher !== "AES-256-GCM"
  )
    throw new Error("Unsupported encrypted backup format.");
  const salt = decode(x.salt, 16),
    iv = decode(x.iv, 12),
    ciphertext = decode(x.ciphertext);
  if (ciphertext.length < 16) throw new Error("Malformed encrypted backup.");
  const derived = await key(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode(header),
        tagLength: 128,
      },
      derived,
      ciphertext,
    );
  } catch {
    throw new Error(
      "The passphrase is incorrect or the backup has been damaged. Nothing was imported.",
    );
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext),
    ) as unknown;
  } catch {
    throw new Error("The decrypted backup contains invalid JSON.");
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}

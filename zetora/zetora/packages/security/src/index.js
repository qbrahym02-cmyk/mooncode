import { generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Cryptographic plugin signing using ED25519.
 *
 * Unlike the v0.6 SHA-256 hash (which anyone could forge because there was no
 * private key), this uses real public-key cryptography:
 *
 * - The Zetora team holds a private key.
 * - The public key is shipped with Zetora.
 * - Plugins signed by the private key can be verified by anyone.
 * - Malicious plugins cannot be "signed" by an attacker without the private key.
 *
 * This is still a trust-on-first-use model: the public key is pinned to the
 * Zetora install. A production registry would use a certificate chain.
 */

const KEY_ALGORITHM = "ed25519";
const SIG_FORMAT = "base64";

export class PluginSigner {
  constructor(keysDir) {
    this.keysDir = path.resolve(keysDir);
    this.privateKeyPath = path.join(this.keysDir, "plugin-signing.key");
    this.publicKeyPath = path.join(this.keysDir, "plugin-signing.pub");
  }

  /**
   * Generate a new ED25519 keypair for plugin signing. Call this once during
   * first-run setup. The private key is written with mode 0600.
   */
  async generateKeys() {
    await mkdir(this.keysDir, { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync(KEY_ALGORITHM);
    await writeFile(this.privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    await writeFile(this.publicKeyPath, publicKey.export({ type: "spki", format: "pem" }));
    return { publicKeyPath: this.publicKeyPath, privateKeyPath: this.privateKeyPath };
  }

  async #loadPrivateKey() {
    try {
      const pem = await readFile(this.privateKeyPath, "utf8");
      return createPrivateKey(pem);
    } catch (error) {
      // ENOENT is expected (keys not generated yet); other errors (permissions,
      // invalid PEM) should be visible to help debugging.
      if (error?.code !== "ENOENT") {
        console.warn(`[zetora] failed to load plugin signing private key: ${error.message}`);
      }
      return null;
    }
  }

  async #loadPublicKey() {
    try {
      const pem = await readFile(this.publicKeyPath, "utf8");
      return createPublicKey(pem);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        console.warn(`[zetora] failed to load plugin signing public key: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Sign a plugin's manifest + entry content with the private key.
   * Returns a base64 signature string.
   */
  async sign(manifest, entryContent = "") {
    const privateKey = await this.#loadPrivateKey();
    if (!privateKey) throw new Error("No signing key found. Call generateKeys() first.");
    const payload = this.#canonical({ ...manifest, signature: undefined }) + entryContent;
    const signature = sign(null, Buffer.from(payload, "utf8"), privateKey);
    return `ed25519:${signature.toString(SIG_FORMAT)}`;
  }

  /**
   * Verify a plugin's signature against the public key.
   * Returns true ONLY if the signature was made by the holder of the private key.
   */
  async verify(manifest, entryContent = "") {
    const publicKey = await this.#loadPublicKey();
    if (!publicKey) return { verified: false, reason: "no_public_key" };
    const signatureField = manifest.signature;
    if (!signatureField || !signatureField.startsWith("ed25519:")) {
      return { verified: false, reason: "no_signature_or_wrong_format" };
    }
    const signatureBase64 = signatureField.slice("ed25519:".length);
    const signature = Buffer.from(signatureBase64, SIG_FORMAT);
    const payload = this.#canonical({ ...manifest, signature: undefined }) + entryContent;
    try {
      const ok = verify(null, Buffer.from(payload, "utf8"), publicKey, signature);
      return { verified: ok, reason: ok ? "valid" : "invalid_signature" };
    } catch (error) {
      return { verified: false, reason: `verification_error: ${error.message}` };
    }
  }

  #canonical(obj) {
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    const out = {};
    for (const key of keys) out[key] = obj[key];
    return JSON.stringify(out);
  }
}

/**
 * Trust registry: a list of trusted plugin author public keys.
 * Plugins signed by any of these keys are considered trusted.
 *
 * The registry is a JSON file mapping authorId -> { publicKey, name, trustLevel }.
 */
export class TrustRegistry {
  constructor(dataRoot) {
    this.registryPath = path.join(path.resolve(dataRoot), "trust-registry.json");
  }

  async read() {
    try {
      const data = JSON.parse(await readFile(this.registryPath, "utf8"));
      // v0.9.1: normalize older registries that lack schemaVersion.
      if (!data.schemaVersion) data.schemaVersion = 1;
      return data;
    } catch { return { schemaVersion: 1, authors: {}, trustLevel: "first-party" }; }
  }

  async write(registry) {
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    // v0.9.1: always stamp schemaVersion on write.
    const payload = { schemaVersion: 1, ...registry };
    const tmp = `${this.registryPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    const { rename } = await import("node:fs/promises");
    await rename(tmp, this.registryPath);
  }

  async addAuthor(authorId, publicKey, name = "", trustLevel = "trusted") {
    const registry = await this.read();
    registry.authors[authorId] = { publicKey, name, trustLevel, addedAt: new Date().toISOString() };
    await this.write(registry);
    return registry.authors[authorId];
  }

  async isTrusted(authorId) {
    const registry = await this.read();
    const author = registry.authors[authorId];
    return Boolean(author && author.trustLevel === "trusted");
  }

  async list() {
    const registry = await this.read();
    return registry.authors || {};
  }
}

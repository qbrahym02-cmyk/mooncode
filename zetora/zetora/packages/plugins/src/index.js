import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat, rm } from "node:fs/promises";
import path from "node:path";

const MANIFEST_NAME = "plugin.json";
const MAX_MANIFEST_BYTES = 64_000;

/**
 * Plugin manifest schema (v0.9):
 *   {
 *     "id": "my-plugin",
 *     "name": "My Plugin",
 *     "version": "1.0.0",
 *     "description": "...",
 *     "author": "mooncode-team",       // authorId in the trust registry
 *     "capabilities": ["tools", "ui"],
 *     "entry": "./index.js",
 *     "permissions": { "tools": [...], "network": false, "fs": [...] },
 *     "signature": "ed25519:base64..."  // ED25519 signature (v0.9+)
 *   }
 *
 * SECURITY CHANGE in v0.9:
 * - The old v0.6-0.8 `verified` field was a self-computed SHA-256 hash that
 *   anyone could forge. It was misleadingly named "verified".
 * - v0.9 replaces it with proper ED25519 signing via @mooncode/security.
 * - The `signedByAuthor` field is true only when the signature is valid
 *   against a trusted author's public key.
 * - The old `selfSignedHash` field is kept for backward compat but clearly
 *   labeled as NOT a trust signal.
 */
export class PluginRegistry {
  constructor(dataRoot, signer = null, trustRegistry = null) {
    this.pluginsDir = path.join(path.resolve(dataRoot), "plugins");
    this.signer = signer;       // PluginSigner from @mooncode/security
    this.trustRegistry = trustRegistry; // TrustRegistry
  }

  async ensure() { await mkdir(this.pluginsDir, { recursive: true }); }

  async list() {
    await this.ensure();
    const entries = await readdir(this.pluginsDir, { withFileTypes: true }).catch(() => []);
    const plugins = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(this.pluginsDir, entry.name, MANIFEST_NAME);
      try {
        const info = await stat(manifestPath);
        if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) continue;
        const raw = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(raw);
        const entryContent = await readFile(path.join(this.pluginsDir, entry.name, manifest.entry || "index.js"), "utf8").catch(() => "");
        const trustInfo = await this.#checkTrust(manifest, entryContent);
        plugins.push({
          ...manifest,
          id: entry.name,
          dir: `plugins/${entry.name}`,
          // New fields (v0.9): honest naming
          signedByAuthor: trustInfo.verified,
          signatureValid: trustInfo.signatureValid,
          authorTrusted: trustInfo.authorTrusted,
          trustLevel: trustInfo.trustLevel,
          // Deprecated field kept for backward compat but clearly not a trust signal
          selfSignedHash: this.#computeSelfHash(manifest, entryContent),
          // Legacy field: kept as false to break the misleading "verified: true" pattern
          verified: false,
          signatureType: manifest.signature?.startsWith("ed25519:") ? "ed25519" : (manifest.signature ? "sha256-legacy" : "none"),
        });
      } catch (error) {
        plugins.push({ id: entry.name, error: error.message, dir: `plugins/${entry.name}`, verified: false });
      }
    }
    return plugins;
  }

  async get(id) {
    const manifestPath = path.join(this.pluginsDir, id, MANIFEST_NAME);
    const raw = await readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  }

  /**
   * Install a plugin. If a signer is configured, signs with ED25519.
   * Otherwise, computes a self-hash (NOT a trust signal — labeled accordingly).
   */
  async install(id, manifest, entryContent = "") {
    await this.ensure();
    const dir = path.join(this.pluginsDir, id);
    await mkdir(dir, { recursive: true });
    // The signed payload MUST include the id so verification matches.
    const manifestWithId = { ...manifest, id };
    let signature;
    let signatureType;
    if (this.signer) {
      signature = await this.signer.sign(manifestWithId, entryContent);
      signatureType = "ed25519";
    } else {
      signature = `sha256-legacy:${this.#computeSelfHash(manifestWithId, entryContent)}`;
      signatureType = "sha256-legacy";
    }
    const signedManifest = { ...manifestWithId, signature };
    await writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify(signedManifest, null, 2) + "\n", "utf8");
    if (entryContent) await writeFile(path.join(dir, manifest.entry || "index.js"), entryContent, "utf8");
    const trustInfo = await this.#checkTrust(signedManifest, entryContent);
    return {
      ...signedManifest,
      signatureType,
      signedByAuthor: trustInfo.verified,
      signatureValid: trustInfo.signatureValid,
      authorTrusted: trustInfo.authorTrusted,
      verified: trustInfo.verified,
      selfSignedHash: signatureType === "sha256-legacy" ? signature.replace("sha256-legacy:", "") : undefined,
      warning: trustInfo.verified ? null : "Plugin is NOT cryptographically verified. Only the Moon Code team's private key can produce a valid signature.",
    };
  }

  async uninstall(id) {
    const dir = path.join(this.pluginsDir, id);
    await rm(dir, { recursive: true, force: true });
    return { removed: id };
  }

  /**
   * Check if a plugin's signature is valid AND the author is trusted.
   * Returns honest status fields.
   */
  async #checkTrust(manifest, entryContent) {
    if (!manifest.signature) {
      return { verified: false, signatureValid: false, authorTrusted: false, trustLevel: "unsigned", reason: "no_signature" };
    }
    if (manifest.signature.startsWith("ed25519:") && this.signer) {
      const result = await this.signer.verify(manifest, entryContent);
      if (!result.verified) {
        return { verified: false, signatureValid: false, authorTrusted: false, trustLevel: "invalid_signature", reason: result.reason };
      }
      const authorTrusted = this.trustRegistry ? await this.trustRegistry.isTrusted(manifest.author || manifest.id).catch(() => false) : false;
      return {
        verified: authorTrusted,
        signatureValid: true,
        authorTrusted,
        trustLevel: authorTrusted ? "trusted" : "signed_but_untrusted_author",
        reason: authorTrusted ? "valid_and_trusted" : "valid_signature_untrusted_author",
      };
    }
    // Legacy SHA-256 hash — not a trust signal
    return {
      verified: false,
      signatureValid: false,
      authorTrusted: false,
      trustLevel: "legacy_self_hash",
      reason: "legacy_sha256_hash_not_cryptographic",
    };
  }

  #computeSelfHash(manifest, entryContent) {
    const { signature, ...rest } = manifest;
    const canonical = JSON.stringify(rest, Object.keys(rest).sort()) + entryContent;
    return createHash("sha256").update(canonical).digest("hex");
  }

  hasCapability(plugin, capability) {
    return Array.isArray(plugin.capabilities) && plugin.capabilities.includes(capability);
  }
}

export const PLUGIN_CAPABILITIES = ["tools", "ui", "provider", "skills", "artifacts"];

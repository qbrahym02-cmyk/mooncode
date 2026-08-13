import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PluginSigner, TrustRegistry } from "../packages/security/src/index.js";
import { AuditLog } from "../packages/security/src/audit.js";
import { RateLimiter } from "../packages/security/src/rate-limit.js";
import { redactSecrets, detectSecrets } from "../packages/security/src/secrets.js";
import { PluginRegistry } from "../packages/plugins/src/index.js";

// === Cryptographic plugin signing ===
test("ED25519 signing: generate keys, sign, verify", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-signer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signer = new PluginSigner(root);
  await signer.generateKeys();
  const manifest = { name: "Test", version: "1.0.0", author: "zetora-team" };
  const entry = "export default {};";
  const signature = await signer.sign(manifest, entry);
  assert.ok(signature.startsWith("ed25519:"));
  const result = await signer.verify({ ...manifest, signature }, entry);
  assert.equal(result.verified, true, "valid signature should verify");
});

test("ED25519 verification rejects tampered content", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-signer-tamper-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signer = new PluginSigner(root);
  await signer.generateKeys();
  const manifest = { name: "Test", version: "1.0.0", author: "zetora-team" };
  const entry = "original content";
  const signature = await signer.sign(manifest, entry);
  // Tamper with the entry.
  const result = await signer.verify({ ...manifest, signature }, "TAMPERED content");
  assert.equal(result.verified, false, "tampered content should fail verification");
  assert.equal(result.reason, "invalid_signature");
});

test("ED25519 verification rejects signature from wrong key", async (t) => {
  const root1 = await mkdtemp(path.join(os.tmpdir(), "zetora-key1-"));
  const root2 = await mkdtemp(path.join(os.tmpdir(), "zetora-key2-"));
  t.after(() => rm(root1, { recursive: true, force: true }));
  t.after(() => rm(root2, { recursive: true, force: true }));
  const signer1 = new PluginSigner(root1);
  const signer2 = new PluginSigner(root2);
  await signer1.generateKeys();
  await signer2.generateKeys();
  const manifest = { name: "Test", version: "1.0.0" };
  const entry = "content";
  // Sign with key1, verify with key2.
  const signature = await signer1.sign(manifest, entry);
  const result = await signer2.verify({ ...manifest, signature }, entry);
  assert.equal(result.verified, false, "signature from wrong key should fail");
});

test("plugin with ED25519 signer gets signedByAuthor when author is trusted", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-trust-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signer = new PluginSigner(root);
  await signer.generateKeys();
  const trust = new TrustRegistry(root);
  const reg = new PluginRegistry(root, signer, trust);
  // Read the public key and add the author to the trust registry.
  const pubKey = await readFile(path.join(root, "plugin-signing.pub"), "utf8");
  await trust.addAuthor("zetora-team", pubKey, "Zetora Team", "trusted");
  const manifest = { name: "Test", version: "1.0.0", author: "zetora-team", entry: "index.js", capabilities: ["tools"] };
  const entry = "export default {};";
  const installed = await reg.install("test-plugin", manifest, entry);
  assert.equal(installed.signatureType, "ed25519");
  assert.equal(installed.signatureValid, true);
  assert.equal(installed.authorTrusted, true);
  assert.equal(installed.signedByAuthor, true);
  assert.equal(installed.verified, true, "trusted author + valid signature = verified");
});

test("plugin without trusted author is NOT verified even with valid signature", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-untrusted-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signer = new PluginSigner(root);
  await signer.generateKeys();
  const trust = new TrustRegistry(root);
  const reg = new PluginRegistry(root, signer, trust);
  // Author is NOT in the trust registry.
  const manifest = { name: "Test", version: "1.0.0", author: "unknown-author", entry: "index.js", capabilities: ["tools"] };
  const entry = "export default {};";
  const installed = await reg.install("test-plugin", manifest, entry);
  assert.equal(installed.signatureValid, true, "signature itself is valid");
  assert.equal(installed.authorTrusted, false, "but author is not trusted");
  assert.equal(installed.signedByAuthor, false);
  assert.equal(installed.verified, false, "untrusted author = not verified");
});

// === Trust registry ===
test("trust registry add and check", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-trust-reg-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const trust = new TrustRegistry(root);
  await trust.addAuthor("alice", "pubkey-123", "Alice", "trusted");
  assert.equal(await trust.isTrusted("alice"), true);
  assert.equal(await trust.isTrusted("bob"), false);
  const list = await trust.list();
  assert.ok(list.alice);
  assert.equal(list.alice.name, "Alice");
});

// === Audit log ===
test("audit log records and reads entries", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = new AuditLog(root);
  await log.record({ action: "file.write", path: "test.js", bytes: 100 });
  await log.record({ action: "approval.approved", tool: "write_file" });
  const entries = await log.read({ limit: 10 });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].action, "file.write");
  assert.equal(entries[1].action, "approval.approved");
  const stats = await log.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.byAction["file.write"], 1);
});

test("audit log filters by action", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zetora-audit-filter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = new AuditLog(root);
  await log.record({ action: "file.write", path: "a.js" });
  await log.record({ action: "file.write", path: "b.js" });
  await log.record({ action: "approval.denied" });
  const writes = await log.read({ action: "file.write" });
  assert.equal(writes.length, 2);
  const denials = await log.read({ action: "approval.denied" });
  assert.equal(denials.length, 1);
});

// === Rate limiter ===
test("rate limiter allows up to max requests", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 5 });
  for (let i = 0; i < 5; i += 1) {
    const result = limiter.check("ip-1");
    assert.equal(result.allowed, true);
  }
  const sixth = limiter.check("ip-1");
  assert.equal(sixth.allowed, false);
  assert.ok(sixth.retryAfterMs > 0);
});

test("rate limiter tracks different IPs independently", () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
  limiter.check("ip-1");
  limiter.check("ip-1");
  limiter.check("ip-1");
  assert.equal(limiter.check("ip-1").allowed, false);
  assert.equal(limiter.check("ip-2").allowed, true, "different IP has its own bucket");
});

// === Secret redaction ===
test("redactSecrets removes OpenAI API keys", () => {
  const input = "My key is sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234";
  const { redacted, found } = redactSecrets(input);
  assert.match(redacted, /\[REDACTED:OPENAI_KEY\]/);
  assert.ok(!redacted.includes("sk-proj-"));
  assert.ok(found.some((f) => f.type === "api_key_openai"));
});

test("redactSecrets removes Bearer tokens", () => {
  const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456";
  const { redacted } = redactSecrets(input);
  assert.match(redacted, /\[REDACTED:BEARER_TOKEN\]/);
});

test("redactSecrets removes private keys", () => {
  const input = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----`;
  const { redacted } = redactSecrets(input);
  assert.match(redacted, /\[REDACTED:PRIVATE_KEY\]/);
});

test("redactSecrets removes AWS access keys", () => {
  const input = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
  const { redacted } = redactSecrets(input);
  assert.match(redacted, /\[REDACTED:AWS_ACCESS_KEY\]/);
});

test("detectSecrets returns list of detected types", () => {
  const input = "key=sk-ant-api03-1234567890abcdefghijklmnopqrstuvwx";
  const types = detectSecrets(input);
  assert.ok(types.includes("api_key_anthropic"));
});

test("detectSecrets returns empty array for clean text", () => {
  const types = detectSecrets("just a normal string with no secrets");
  assert.equal(types.length, 0);
});

/**
 * v3.2.0: GitHub PR workflow — fetch and work on pull requests.
 *
 * Usage: mooncode pr <number>
 *   1. Fetches PR info via gh CLI
 *   2. Checks out the PR branch
 *   3. Detects cross-repo forks
 *   4. Opens the workspace in Moon Code
 */
import { spawnSync } from "node:child_process";

export function fetchPR(prNumber, repo = null) {
  const args = ["pr", "checkout", String(prNumber)];
  if (repo) args.push("--repo", repo);
  const result = spawnSync("gh", args, { encoding: "utf8", cwd: process.cwd() });
  if (result.status !== 0) {
    throw new Error(`Failed to checkout PR #${prNumber}: ${result.stderr || result.stdout}`);
  }
  return { ok: true, output: result.stdout };
}

export function getPRInfo(prNumber, repo = null) {
  const args = ["pr", "view", String(prNumber), "--json", "title,body,author,headRefName,baseRefName,url,state"];
  if (repo) args.push("--repo", repo);
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout); } catch { return null; }
}

export function installGitHubAgent(repo = null) {
  const args = ["auth", "status"];
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("GitHub CLI not authenticated. Run: gh auth login");
  }
  return { ok: true, message: "GitHub agent ready. Use 'mooncode pr <number>' to work on a PR." };
}

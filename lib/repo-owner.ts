import "server-only";

import { App } from "@octokit/app";
import { getGithubId } from "@/lib/github-account";

// The "repo owner" is the single GitHub account that owns this GitHub App
// (`GET /app` -> owner.id). A user qualifies only when their OAuth-linked GitHub
// account id equals it. Google / email-OTP users (no linked GitHub account) and
// anyone else who merely installed the App never qualify. Any failure denies.
const CACHE_TTL_MS = 10 * 60_000;

let cached: { ownerId: number; expiresAt: number } | null = null;
let inflight: Promise<number> | null = null;

const fetchAppOwnerId = async () => {
  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });
  const { data } = await app.octokit.request("GET /app");
  const owner = data?.owner;
  if (!owner || !Number.isInteger(owner.id)) throw new Error("GitHub App has no resolvable owner.");
  return owner.id;
};

const getAppOwnerId = async (): Promise<number> => {
  if (cached && cached.expiresAt > Date.now()) return cached.ownerId;
  inflight ??= fetchAppOwnerId()
    .then((ownerId) => {
      cached = { ownerId, expiresAt: Date.now() + CACHE_TTL_MS };
      return ownerId;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

const isRepoOwnerUser = async (userId: string) => {
  try {
    const githubId = await getGithubId(userId);
    if (githubId === null) return false;
    return githubId === (await getAppOwnerId());
  } catch (error) {
    console.warn("[repo-owner] owner lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export { isRepoOwnerUser };

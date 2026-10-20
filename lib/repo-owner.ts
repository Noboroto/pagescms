import "server-only";

import { App } from "@octokit/app";
import { getGithubId } from "@/lib/github-account";

// The "repo owner" is the person whose personal GitHub account has this GitHub
// App installed. Matching is by GitHub account id (not the editable login), and
// only against installations returned for the App itself, so Google / email-OTP
// users (no linked GitHub account) can never qualify.
const CACHE_TTL_MS = 60_000;

let cached: { ids: Set<number>; expiresAt: number } | null = null;

const loadInstallationAccountIds = async () => {
  if (cached && cached.expiresAt > Date.now()) return cached.ids;

  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });

  const ids = new Set<number>();
  const perPage = 100;
  for (let page = 1; page <= 20; page++) {
    const response = await app.octokit.request("GET /app/installations", {
      per_page: perPage,
      page,
    });
    for (const installation of response.data) {
      const account = installation.account;
      if (account && "type" in account && account.type === "User") {
        ids.add(account.id);
      }
    }
    if (response.data.length < perPage) break;
  }

  cached = { ids, expiresAt: Date.now() + CACHE_TTL_MS };
  return ids;
};

const isRepoOwnerUser = async (userId: string) => {
  try {
    const githubId = await getGithubId(userId);
    if (githubId === null) return false;
    return (await loadInstallationAccountIds()).has(githubId);
  } catch (error) {
    console.warn("[repo-owner] installation lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export { isRepoOwnerUser };

/**
 * Optional `DEFAULT_REPO` ("owner/repo" or "owner/repo@branch"): signed-in users
 * who can access it are sent straight to it instead of the home page.
 */
type DefaultRepo = { owner: string; repo: string; branch: string | null };

const getDefaultRepo = (): DefaultRepo | null => {
  const raw = process.env.DEFAULT_REPO?.trim();
  if (!raw) return null;

  const match = /^([^/\s@]+)\/([^/\s@]+)(?:@(\S+))?$/.exec(raw);
  if (!match) return null;

  return { owner: match[1], repo: match[2], branch: match[3] ?? null };
};

const getDefaultRepoPath = ({ owner, repo, branch }: DefaultRepo) =>
  branch
    ? `/${owner}/${repo}/${encodeURIComponent(branch)}`
    : `/${owner}/${repo}`;

export { getDefaultRepo, getDefaultRepoPath };
export type { DefaultRepo };

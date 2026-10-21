import { requireApiSuccess } from "@/lib/api-client";
import { getFileName, normalizePath } from "@/lib/utils/file";

type RepoRef = { owner: string; repo: string; branch: string };

/**
 * Download a repository file through `GET .../files/[path]`, which checks the scope and
 * returns GitHub's raw URL. The file is fetched as a blob because the `download`
 * attribute is ignored for cross-origin links.
 */
const downloadRepoFile = async (
  repo: RepoRef,
  path: string,
  { type, name }: { type: "content" | "media" | "template" | "settings"; name?: string },
) => {
  const normalizedPath = normalizePath(path);
  const params = new URLSearchParams({ type });
  if (name) params.set("name", name);

  const response = await fetch(`/api/${repo.owner}/${repo.repo}/${encodeURIComponent(repo.branch)}/files/${encodeURIComponent(normalizedPath)}?${params.toString()}`);
  const data = await requireApiSuccess<any>(response, "Failed to download file");

  const fileResponse = await fetch(data.data.url);
  if (!fileResponse.ok) throw new Error(`Failed to download file (${fileResponse.status}).`);
  const objectUrl = URL.createObjectURL(await fileResponse.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = data.data.name || getFileName(normalizedPath);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari may still be reading the blob after click(); revoking right away can empty the download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export { downloadRepoFile };

import { type NextRequest } from "next/server";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getSchemaByName } from "@/lib/schema";
import { parseEntryContent } from "@/lib/entry-content";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, normalizePath } from "@/lib/utils/file";
import { assertGithubIdentity } from "@/lib/authz-shared";
import { getToken } from "@/lib/token";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Fetches and parses individual file contents from GitHub repositories
 * (usually for editing).
 * 
 * GET /api/[owner]/[repo]/[branch]/entries/[path]?name=[schemaName]
 * 
 * Requires authentication. If no schema name is provided, we return the raw
 * contents.
 */

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ owner: string, repo: string, branch: string, path: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo);
    if (!token) throw createHttpError("Token not found", 401);

    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get("name");
    const metaOnly =
      searchParams.get("meta") === "true" ||
      searchParams.get("meta") === "1";
    
    const normalizedPath = normalizePath(params.path);
    if (normalizedPath === ".pages.yml") {
      assertGithubIdentity(user, "Only GitHub users can access settings.");
    }

    if (!name && normalizedPath !== ".pages.yml") {
      throw createHttpError("If no content entry name is provided, the path must be \".pages.yml\".", 400);
    }

    if (!name && normalizedPath === ".pages.yml" && metaOnly) {
      const cachedConfig = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      return Response.json({
        status: "success",
        data: {
          sha: cachedConfig?.sha ?? null,
          version: cachedConfig?.version ?? null,
          lastCheckedAt: cachedConfig?.lastCheckedAt ?? null,
        },
      });
    }

    let config;
    let schema;

    if (name) {
      config = await getConfig(params.owner, params.repo, params.branch, {
        getToken: async () => token,
      });
      if (!config) throw createHttpError(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`, 404);

      schema = getSchemaByName(config.object, name);
      if (!schema) throw createHttpError(`Schema not found for ${name}.`, 404);

      if (!normalizedPath.startsWith(schema.path)) throw createHttpError(`Invalid path "${params.path}" for ${schema.type} "${name}".`, 400);

      const extension = schema.extension ?? "";
      if (getFileExtension(normalizedPath) !== extension) {
        throw createHttpError(`Invalid extension "${getFileExtension(normalizedPath)}" for ${schema.type} "${name}".`, 400);
      }
    } else {
      config = {};
    }
    
    const octokit = createOctokitInstance(token);
    let response;
    try {
      response = await octokit.rest.repos.getContent({
        owner: params.owner,
        repo: params.repo,
        path: normalizedPath,
        ref: params.branch
      });
    } catch (error: any) {
      if (error?.status === 404) {
        throw createHttpError("Not found", 404);
      }
      throw error;
    }
    
    if (Array.isArray(response.data)) {
      throw createHttpError("Expected a file but found a directory", 400);
    } else if (response.data.type !== "file") {
      throw createHttpError("Invalid response type", 500);
    }

    const content = Buffer.from(response.data.content, "base64").toString();
    let contentObject;
    try {
      contentObject = name
        ? parseEntryContent(content, schema, config)
        : { body: content };
    } catch (error: any) {
      throw createHttpError(error.message, 400);
    }

    return Response.json({
      status: "success",
      data: {
        sha: response.data.sha,
        name: response.data.name,
        path: response.data.path,
        contentObject
      }
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}

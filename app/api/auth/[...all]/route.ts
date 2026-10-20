import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// The auth instance is resolved per request so settings changes apply without a redeploy.
export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(async (request: Request) =>
  (await getAuth()).handler(request),
);

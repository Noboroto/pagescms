import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session-server";
import { getToken } from "@/lib/token";
import { getDefaultRepo, getDefaultRepoPath } from "@/lib/default-repo";
import type { User } from "@/types/user";
import HomePage from "./home-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ home?: string }>;
}) {
  const defaultRepo = getDefaultRepo();
  if (!defaultRepo) return <HomePage />;

  // `/?home=1` is the escape hatch back to the project list.
  const { home } = await searchParams;
  if (home == null) {
    const session = await getServerSession();
    if (session?.user) {
      let hasAccess = false;
      try {
        const { token } = await getToken(
          session.user as User,
          defaultRepo.owner,
          defaultRepo.repo,
        );
        hasAccess = Boolean(token);
      } catch {
        // No access (or lookup failure): fall through to the normal home page.
      }
      if (hasAccess) redirect(getDefaultRepoPath(defaultRepo));
    }
  }

  return <HomePage hideTemplates />;
}

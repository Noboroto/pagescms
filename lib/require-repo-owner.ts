import "server-only";

import { headers } from "next/headers";
import { UserFacingError } from "@/lib/action-error";
import { getAuth } from "@/lib/auth";
import { isRepoOwnerUser } from "@/lib/repo-owner";

// Repo owner only: the user whose linked GitHub account owns this GitHub App.
// Email-OTP / Google-only users never pass.
export const requireRepoOwner = async () => {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) throw new UserFacingError("Not signed in.");
  if (!(await isRepoOwnerUser(user.id))) throw new UserFacingError("Only the repository owner can change these settings.");
  return user;
};

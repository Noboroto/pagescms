import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { isRepoOwnerUser } from "@/lib/repo-owner";

// Repo owner only: a user signed in with GitHub whose GitHub account has this
// GitHub App installed. Email-OTP / Google-only users never pass.
export const requireRepoOwner = async () => {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const user = session?.user;
  if (!user) throw new Error("Not signed in.");
  if (!(await isRepoOwnerUser(user.id))) throw new Error("Only the repository owner can change these settings.");
  return user;
};

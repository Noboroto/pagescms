import Link from "next/link";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { db } from "@/db";
import { accountTable } from "@/db/schema";
import { isRepoOwnerUser } from "@/lib/repo-owner";
import { getGoogleAuthStatus } from "@/lib/google-settings";
import { getBaseUrl } from "@/lib/base-url";
import { GoogleSignInSettings } from "@/components/settings/google-sign-in";
import { MainRootLayout } from "../main-root-layout";
import { Installations } from "@/components/settings/installations";
import { Identities } from "@/components/settings/identities";
import { Profile } from "@/components/settings/profile";
import { DocumentTitle } from "@/components/document-title";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardDescription,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function Page() {
  const session = await (await getAuth()).api.getSession({
    headers: await headers(),
  });
  const user = session?.user;
  if (!user) throw new Error("User not found");
  const githubAccount = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, user.id),
      eq(accountTable.providerId, "github"),
    ),
  });
  const githubConnected = Boolean(githubAccount);
  const githubManageUrl = process.env.GITHUB_APP_CLIENT_ID
    ? `https://github.com/settings/connections/applications/${process.env.GITHUB_APP_CLIENT_ID}`
    : null;

  // Sign-in provider settings: repo owner only (GitHub account with the App installed).
  const isOwner = githubConnected && (await isRepoOwnerUser(user.id));
  const googleStatus = isOwner ? await getGoogleAuthStatus() : null;
  const baseUrl = getBaseUrl().replace(/\/+$/, "");

  return (
    <MainRootLayout>
      <DocumentTitle title="Settings" />
      <div className="max-w-screen-sm mx-auto p-4 md:p-6 space-y-6">
        <Link
          className={cn(
            buttonVariants({ variant: "outline", size: "xs" }),
            "inline-flex",
          )}
          href="/"
        >
          <ArrowLeft />
          Go home
        </Link>
        <header className="flex items-center mb-6">
          <h1 className="font-semibold tracking-tight text-lg md:text-2xl">
            Settings
          </h1>
        </header>
        <div className="flex flex-col relative flex-1 space-y-6">
          <Profile
            name={user.name}
            email={user.email}
            githubUsername={user.githubUsername}
          />

          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
              <CardDescription>
                Your sign-in methods and linked identity providers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Identities
                email={user.email}
                githubConnected={githubConnected}
                githubUsername={user.githubUsername}
                githubManageUrl={githubManageUrl}
              />
            </CardContent>
          </Card>

          {googleStatus && (
            <Card>
              <CardHeader>
                <CardTitle>Google sign-in</CardTitle>
                <CardDescription>
                  Let invited people sign in with Google. Only you, as the repository owner, can see this.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GoogleSignInSettings
                  initialClientId={googleStatus.clientId}
                  secretSet={googleStatus.secretSet}
                  initialEnabled={googleStatus.enabled}
                  origin={new URL(baseUrl).origin}
                  redirectUri={`${baseUrl}/api/auth/callback/google`}
                />
              </CardContent>
            </Card>
          )}

          {githubConnected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">
                  Installations
                </CardTitle>
                <CardDescription>
                  Manage the accounts the Github application is installed on.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Installations />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainRootLayout>
  );
}

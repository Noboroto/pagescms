import { createAuthClient } from "better-auth/client";
import { oneTapClient } from "better-auth/client/plugins";

// The Client ID is a runtime server env var (passed down as a prop), so the One
// Tap plugin cannot live on the shared auth client built at module load.
const clients = new Map<string, ReturnType<typeof create>>();

const create = (clientId: string) =>
  createAuthClient({
    plugins: [
      oneTapClient({
        clientId,
        autoSelect: false,
        cancelOnTapOutside: true,
        uxMode: "popup",
      }),
    ],
  });

export const getOneTapClient = (clientId: string) => {
  let client = clients.get(clientId);
  if (!client) {
    client = create(clientId);
    clients.set(clientId, client);
  }
  return client;
};

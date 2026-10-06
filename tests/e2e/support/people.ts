import type { BrowserContextOptions } from "@playwright/test";

import { E2E_SESSIONS_URL } from "../../setup/e2e-env";

type StorageState = Exclude<NonNullable<BrowserContextOptions["storageState"]>, string>;

/** Creates a new person with a live session and returns what their browser would hold. */
export async function newSignedInPerson(name: string): Promise<StorageState> {
  const response = await fetch(E2E_SESSIONS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw new Error(`Could not create a signed-in person (HTTP ${response.status}).`);
  return (await response.json()) as StorageState;
}

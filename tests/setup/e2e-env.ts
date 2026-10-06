import path from "node:path";

import { TEST_AUTH_ENV } from "./auth-env";

export const E2E_PORT = 3100;
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;

/**
 * Settings for the application under test. The origin must match the address the browser uses, because
 * Better Auth only accepts requests from its own origin.
 */
export const E2E_AUTH_ENV = { ...TEST_AUTH_ENV, BETTER_AUTH_URL: E2E_ORIGIN } as const;

/** The end-to-end server script listens here so tests can ask for new signed-in people. Loopback only. */
export const E2E_SESSIONS_PORT = 3101;
export const E2E_SESSIONS_URL = `http://127.0.0.1:${E2E_SESSIONS_PORT}/sessions`;

/** Browser state of a person who is signed in for the whole run; tests that end a session must use their own person. */
export const E2E_SIGNED_IN_STATE = path.resolve(process.cwd(), ".data", "e2e", "signed-in.json");

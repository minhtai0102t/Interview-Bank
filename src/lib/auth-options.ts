import type { BetterAuthOptions } from "better-auth";

import type { AuthEnv } from "./env";

/**
 * Better Auth settings shared by the application, the test instance and the schema generator.
 *
 * This module must stay free of database, `server-only` and Next.js imports: the Better Auth CLI loads it
 * outside of Next.js to generate the Prisma schema.
 */

/** Where sign-in problems are shown. Better Auth redirects here with `?error=<code>`. */
export const SIGN_IN_PATH = "/sign-in";

export function buildAuthOptions(env: AuthEnv) {
  const { google, github } = env.providers;

  return {
    appName: "Interview Bank",
    baseURL: env.baseURL,
    secret: env.secret,
    socialProviders: {
      ...(google && { google: { clientId: google.clientId, clientSecret: google.clientSecret } }),
      ...(github && { github: { clientId: github.clientId, clientSecret: github.clientSecret } }),
    },
    account: {
      // The OAuth state lives in an encrypted cookie, so starting a sign-in never writes to the database.
      storeStateStrategy: "cookie",
      // Provider tokens are not used after sign-in; keep them unreadable at rest anyway.
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        // A matching email address alone must not attach a new provider to an existing account.
        disableImplicitLinking: true,
      },
    },
    user: {
      additionalFields: {
        // Only trusted maintenance code changes this (see `pnpm admin:grant`); clients cannot send it.
        role: { type: ["USER", "ADMIN"], required: true, defaultValue: "USER", input: false },
      },
    },
    rateLimit: {
      // Off by default outside production; the limits are part of the behavior under test.
      enabled: true,
      storage: "database",
      window: 10,
      max: 60,
    },
    advanced: {
      // Better Auth turns the origin and callback URL checks off when NODE_ENV is "test". Keep them on everywhere.
      disableOriginCheck: false,
      database: { joins: true },
    },
    onAPIError: { errorURL: SIGN_IN_PATH },
  } satisfies BetterAuthOptions;
}

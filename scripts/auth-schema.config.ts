/**
 * Configuration for the Better Auth CLI, which reads it to generate the auth models of the Prisma schema:
 *
 *   pnpm dlx auth@1.7.7 generate --config scripts/auth-schema.config.ts --adapter prisma --dialect postgresql
 *
 * Only settings that affect the database schema matter here; the values below are placeholders.
 */
import { betterAuth } from "better-auth";

import { buildAuthOptions } from "../src/lib/auth-options";

export const auth = betterAuth(
  buildAuthOptions({
    secret: "placeholder-secret-used-only-to-generate-the-schema",
    baseURL: "http://localhost:3000",
    providers: {
      google: { clientId: "placeholder", clientSecret: "placeholder" },
      github: { clientId: "placeholder", clientSecret: "placeholder" },
    },
  }),
);

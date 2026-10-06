import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";

import { buildAuthOptions } from "@/lib/auth-options";
import { getAuthEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

function createAuth() {
  return betterAuth({
    ...buildAuthOptions(getAuthEnv()),
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    // Lets Server Actions that sign in or out set the session cookie. It has to be the last plugin.
    plugins: [nextCookies()],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Lazy so that importing this module (for example during `next build`) never needs secrets or a database. */
export function getAuth(): ReturnType<typeof createAuth> {
  return (instance ??= createAuth());
}

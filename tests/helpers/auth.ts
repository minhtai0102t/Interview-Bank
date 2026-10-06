import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { testUtils } from "better-auth/plugins";

import { buildAuthOptions } from "@/lib/auth-options";
import { getAuthEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

/**
 * A second Better Auth instance for tests only. It shares settings, secret and database with the
 * application, so cookies it issues are accepted by the real instance, and it adds helpers that can
 * create sessions without a provider. It must never be imported by application code.
 */
function createTestAuth() {
  return betterAuth({
    ...buildAuthOptions(getAuthEnv()),
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    plugins: [testUtils()],
  });
}

let instance: ReturnType<typeof createTestAuth> | undefined;

async function testHelpers() {
  instance ??= createTestAuth();
  return (await instance.$context).test;
}

export interface SignedInUser {
  readonly user: { readonly id: string; readonly email: string; readonly name: string; readonly role?: unknown };
  /** Request headers carrying this user's session cookie. */
  readonly headers: Headers;
  readonly sessionToken: string;
}

/** Creates a user in the database, starts a session for them and returns what a browser would send. */
export async function signInAs(overrides: Record<string, unknown> = {}): Promise<SignedInUser> {
  const test = await testHelpers();
  const user = await test.saveUser(test.createUser(overrides));
  const { headers, token } = await test.login({ userId: user.id });
  return { user, headers, sessionToken: token };
}

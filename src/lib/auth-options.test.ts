import { describe, expect, it } from "vitest";

import { buildAuthOptions, SIGN_IN_PATH } from "./auth-options";
import type { AuthEnv } from "./env";

const google = { clientId: "google-id", clientSecret: "google-secret" };
const github = { clientId: "github-id", clientSecret: "github-secret" };

function envWith(providers: AuthEnv["providers"]): AuthEnv {
  return { secret: "s".repeat(32), baseURL: "https://interview.example", providers };
}

describe("buildAuthOptions", () => {
  it("passes the application origin and the secret through", () => {
    const options = buildAuthOptions(envWith({ google }));

    expect(options.baseURL).toBe("https://interview.example");
    expect(options.secret).toBe("s".repeat(32));
  });

  it("offers every configured provider with its credentials", () => {
    const options = buildAuthOptions(envWith({ google, github }));

    expect(options.socialProviders).toEqual({ google, github });
  });

  it("offers only the providers that are configured", () => {
    expect(Object.keys(buildAuthOptions(envWith({ github })).socialProviders)).toEqual(["github"]);
    expect(Object.keys(buildAuthOptions(envWith({ google })).socialProviders)).toEqual(["google"]);
  });

  it("has no email and password sign-in", () => {
    expect(buildAuthOptions(envWith({ google }))).not.toHaveProperty("emailAndPassword");
  });

  it("never links accounts by a matching email address alone", () => {
    const { accountLinking } = buildAuthOptions(envWith({ google })).account;

    expect(accountLinking).toEqual({ enabled: true, disableImplicitLinking: true });
  });

  it("keeps the OAuth state out of the database and provider tokens encrypted", () => {
    const { account } = buildAuthOptions(envWith({ google }));

    expect(account.storeStateStrategy).toBe("cookie");
    expect(account.encryptOAuthTokens).toBe(true);
  });

  it("starts everyone as a USER and keeps the role out of reach of client input", () => {
    const { role } = buildAuthOptions(envWith({ google })).user.additionalFields;

    expect(role).toMatchObject({ type: ["USER", "ADMIN"], required: true, defaultValue: "USER", input: false });
  });

  it("limits request rates through the database in every environment", () => {
    expect(buildAuthOptions(envWith({ google })).rateLimit).toMatchObject({ enabled: true, storage: "database" });
  });

  it("checks where requests come from in every environment, tests included", () => {
    // Better Auth skips these checks when NODE_ENV is "test" unless told otherwise.
    expect(buildAuthOptions(envWith({ google })).advanced.disableOriginCheck).toBe(false);
  });

  it("shows errors on the sign-in page", () => {
    expect(buildAuthOptions(envWith({ google })).onAPIError.errorURL).toBe(SIGN_IN_PATH);
  });
});

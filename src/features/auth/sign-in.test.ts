import { describe, expect, it } from "vitest";

import { parseAuthEnv } from "@/lib/env";
import { TEST_AUTH_ENV } from "../../../tests/setup/auth-env";

import { configuredProviders, parseSignInRequest, signInErrorMessage } from "./sign-in";

function envWith(overrides: Record<string, string | undefined>) {
  return parseAuthEnv({ ...TEST_AUTH_ENV, ...overrides });
}

describe("configuredProviders", () => {
  it("lists every provider that has credentials, Google first", () => {
    expect(configuredProviders(envWith({}))).toEqual([
      { id: "google", label: "Google" },
      { id: "github", label: "GitHub" },
    ]);
  });

  it("leaves out a provider without credentials", () => {
    const env = envWith({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });

    expect(configuredProviders(env).map((provider) => provider.id)).toEqual(["github"]);
  });
});

describe("parseSignInRequest", () => {
  const both = ["google", "github"] as const;

  it("accepts an offered provider and a path on this site", () => {
    expect(parseSignInRequest({ provider: "github", next: "/imports" }, both)).toEqual({
      provider: "github",
      next: "/imports",
    });
  });

  it("goes to the home page when nothing was asked for", () => {
    expect(parseSignInRequest({ provider: "google", next: null }, both)).toEqual({ provider: "google", next: "/" });
  });

  it.each(["https://evil.example/steal", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/sign-in"])(
    "does not send anyone to %s afterwards",
    (next) => {
      expect(parseSignInRequest({ provider: "google", next }, both)?.next).toBe("/");
    },
  );

  it("refuses a provider that is not offered here", () => {
    expect(parseSignInRequest({ provider: "google", next: "/" }, ["github"])).toBeNull();
  });

  it.each([["facebook"], [""], ["__proto__"], ["constructor"], [null], [undefined], [["google"]], [42], [new File([], "google")]])(
    "refuses %j as a provider",
    (provider) => {
      expect(parseSignInRequest({ provider, next: "/" }, both)).toBeNull();
    },
  );
});

describe("signInErrorMessage", () => {
  it("has nothing to say when sign-in did not fail", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
    expect(signInErrorMessage(["access_denied"])).toBeNull();
  });

  it("explains the failures people can run into", () => {
    const codes = ["access_denied", "account_not_linked", "state_mismatch", "email_not_found", "provider_unavailable"];
    const messages = codes.map((code) => signInErrorMessage(code));

    expect(messages.every((message) => typeof message === "string" && message.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it("tells people with another sign-in method to use the one they started with", () => {
    expect(signInErrorMessage("account_not_linked")).toMatch(/different (sign-in|provider)|first/i);
  });

  it("gives one general message for any other code, whatever it says", () => {
    const general = signInErrorMessage("something_new");

    expect(general).toMatch(/try again/i);
    for (const code of ["<script>alert(1)</script>", "__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(signInErrorMessage(code)).toBe(general);
    }
  });

  it("never repeats the code it was given", () => {
    expect(signInErrorMessage("Your account is locked, call 555-0100")).not.toContain("555-0100");
  });
});

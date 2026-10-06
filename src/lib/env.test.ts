import { describe, expect, it } from "vitest";

import { parseAuthEnv, parseServerEnv } from "./env";

const databaseUrl = "postgresql://app:pw@localhost:5432/interview_bank";

describe("parseServerEnv", () => {
  it("accepts a postgres URL and leaves DIRECT_URL undefined when absent", () => {
    const env = parseServerEnv({ DATABASE_URL: databaseUrl });

    expect(env.DATABASE_URL).toBe(databaseUrl);
    expect(env.DIRECT_URL).toBeUndefined();
  });

  it("accepts the postgres:// scheme and a separate direct URL", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgres://app:pw@pooler.example.com/db",
      DIRECT_URL: "postgres://app:pw@direct.example.com/db",
    });

    expect(env.DIRECT_URL).toBe("postgres://app:pw@direct.example.com/db");
  });

  it("names the missing variable", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres URL without echoing its value", () => {
    const parse = () => parseServerEnv({ DATABASE_URL: "mysql://admin:hunter2@db.example.com/app" });

    expect(parse).toThrow(/DATABASE_URL/);
    expect(parse).not.toThrow(/hunter2/);
  });

  it("validates DIRECT_URL when it is provided", () => {
    const parse = () => parseServerEnv({ DATABASE_URL: databaseUrl, DIRECT_URL: "not a url" });

    expect(parse).toThrow(/DIRECT_URL/);
  });
});

const secret = "s".repeat(32);

const authSource = {
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: "https://interview-bank.example.com",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
};

describe("parseAuthEnv", () => {
  it("returns the secret, the base URL and only the configured providers", () => {
    const env = parseAuthEnv(authSource);

    expect(env).toEqual({
      secret,
      baseURL: "https://interview-bank.example.com",
      providers: { google: { clientId: "google-id", clientSecret: "google-secret" } },
    });
  });

  it("returns both providers when both are configured", () => {
    const env = parseAuthEnv({ ...authSource, GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret" });

    expect(env.providers).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      github: { clientId: "gh-id", clientSecret: "gh-secret" },
    });
  });

  it("names the missing secret", () => {
    expect(() => parseAuthEnv({ ...authSource, BETTER_AUTH_SECRET: undefined })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects a short secret without echoing it", () => {
    const parse = () => parseAuthEnv({ ...authSource, BETTER_AUTH_SECRET: "too-short-hunter2" });

    expect(parse).toThrow(/BETTER_AUTH_SECRET/);
    expect(parse).not.toThrow(/hunter2/);
  });

  it("accepts plain http for local hosts only", () => {
    expect(parseAuthEnv({ ...authSource, BETTER_AUTH_URL: "http://localhost:3100" }).baseURL).toBe("http://localhost:3100");
    expect(parseAuthEnv({ ...authSource, BETTER_AUTH_URL: "http://127.0.0.1:3100" }).baseURL).toBe("http://127.0.0.1:3100");
    expect(() => parseAuthEnv({ ...authSource, BETTER_AUTH_URL: "http://interview-bank.example.com" })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it("requires an origin without a path, query or fragment", () => {
    for (const url of ["https://example.com/app", "https://example.com/?a=1", "https://example.com/#top", "not a url"]) {
      expect(() => parseAuthEnv({ ...authSource, BETTER_AUTH_URL: url }), url).toThrow(/BETTER_AUTH_URL/);
    }
  });

  it("normalizes a trailing slash on the base URL", () => {
    expect(parseAuthEnv({ ...authSource, BETTER_AUTH_URL: "https://example.com/" }).baseURL).toBe("https://example.com");
  });

  it("requires a provider's id and secret together", () => {
    expect(() => parseAuthEnv({ ...authSource, GOOGLE_CLIENT_SECRET: undefined })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => parseAuthEnv({ ...authSource, GITHUB_CLIENT_SECRET: "gh-secret" })).toThrow(/GITHUB_CLIENT_ID/);
  });

  it("requires at least one provider", () => {
    const parse = () => parseAuthEnv({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: authSource.BETTER_AUTH_URL });

    expect(parse).toThrow(/GOOGLE_CLIENT_ID/);
    expect(parse).toThrow(/GITHUB_CLIENT_ID/);
  });

  it("treats blank provider values as not configured", () => {
    const env = parseAuthEnv({
      ...authSource,
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "  ",
    });

    expect(Object.keys(env.providers)).toEqual(["google"]);
  });

  it("never echoes provider secrets", () => {
    const parse = () => parseAuthEnv({ ...authSource, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: "top-secret-value" });

    expect(parse).toThrow(/GOOGLE_CLIENT_ID/);
    expect(parse).not.toThrow(/top-secret-value/);
  });
});

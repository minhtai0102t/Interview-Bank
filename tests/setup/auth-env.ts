/**
 * Placeholder credentials for tests and local end-to-end runs. They are valid in shape only: no provider
 * knows them, so nothing here can sign in anywhere.
 */
export const TEST_AUTH_ENV = {
  BETTER_AUTH_SECRET: "test-only-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:3100",
  GOOGLE_CLIENT_ID: "test-google-client-id.apps.example.test",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  GITHUB_CLIENT_ID: "test-github-client-id",
  GITHUB_CLIENT_SECRET: "test-github-client-secret",
} as const;

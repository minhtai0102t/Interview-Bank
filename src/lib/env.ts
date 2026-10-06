import "server-only";

import { z } from "zod";

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

const serverEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: postgresUrl.optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Names only: values may be credentials. */
function failWithNames(error: z.ZodError): never {
  const names = new Set(error.issues.map((issue) => issue.path.join(".")));
  throw new Error(`Invalid or missing environment variables: ${[...names].join(", ")}`);
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (result.success) return result.data;

  return failWithNames(result.error);
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** An origin such as https://example.com. Plain http is only for local development hosts. */
const authBaseUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => {
    // Refinements also run after the URL check failed, so the value may not parse at all.
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    const isOrigin = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    const isSecureEnough = url.protocol === "https:" || localHosts.has(url.hostname);
    return isOrigin && isSecureEnough;
  })
  .transform((value) => new URL(value).origin);

/** Blank values count as "not configured" so an empty line in an env file does not half-enable a provider. */
const optionalCredential = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const authEnvSchema = z
  .object({
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: authBaseUrl,
    GOOGLE_CLIENT_ID: optionalCredential,
    GOOGLE_CLIENT_SECRET: optionalCredential,
    GITHUB_CLIENT_ID: optionalCredential,
    GITHUB_CLIENT_SECRET: optionalCredential,
  })
  .superRefine((env, context) => {
    const pairs = [
      { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
      { id: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
    ] as const;
    let anyProvided = false;

    for (const { id, secret } of pairs) {
      if (env[id] || env[secret]) anyProvided = true;
      if (env[id] && !env[secret]) context.addIssue({ code: "custom", path: [secret], message: "required with the client id" });
      if (env[secret] && !env[id]) context.addIssue({ code: "custom", path: [id], message: "required with the client secret" });
    }

    if (!anyProvided) {
      for (const { id } of pairs) context.addIssue({ code: "custom", path: [id], message: "configure at least one provider" });
    }
  });

export interface ProviderCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AuthEnv {
  readonly secret: string;
  /** Origin of the application, used for OAuth callback URLs and cookie security. */
  readonly baseURL: string;
  readonly providers: { readonly google?: ProviderCredentials; readonly github?: ProviderCredentials };
}

export function parseAuthEnv(source: Record<string, string | undefined>): AuthEnv {
  const result = authEnvSchema.safeParse(source);
  if (!result.success) return failWithNames(result.error);

  const env = result.data;
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : undefined;
  const github = env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
    : undefined;

  return {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    providers: { ...(google && { google }), ...(github && { github }) },
  };
}

let cachedAuth: AuthEnv | undefined;

export function getAuthEnv(): AuthEnv {
  cachedAuth ??= parseAuthEnv(process.env);
  return cachedAuth;
}

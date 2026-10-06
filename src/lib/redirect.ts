import { SIGN_IN_PATH } from "./auth-options";

/** Never used to build a destination; it only gives relative paths something to resolve against. */
const PLACEHOLDER_ORIGIN = "http://local.invalid";

/**
 * Turns untrusted input (a `next` parameter, for example) into a path on this site.
 * Anything that could lead elsewhere, or back to the sign-in page, yields the fallback.
 */
export function safeRedirectPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  // The URL parser drops tabs and newlines and reads "\" as "/", exactly like browsers do.
  if (!URL.canParse(value, PLACEHOLDER_ORIGIN)) return fallback;

  const url = new URL(value, PLACEHOLDER_ORIGIN);
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
  if (url.pathname.replace(/\/+$/, "") === SIGN_IN_PATH) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

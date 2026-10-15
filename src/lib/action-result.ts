import { type DomainError, type DomainErrorCode, isDomainError } from "@/lib/errors";
import { signInHref } from "@/lib/redirect";

export interface ActionRecovery {
  label: string;
  href: string;
}

export interface ActionFailure {
  ok: false;
  error: string;
  code: DomainErrorCode;
  recovery?: ActionRecovery;
}

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(
  error: DomainError | { code: DomainErrorCode; message: string },
  recovery?: ActionRecovery,
): ActionFailure {
  return { ok: false, error: error.message, code: error.code, ...(recovery ? { recovery } : {}) };
}

function safeActionMessage(error: DomainError, fallback: string): string {
  if (error.code === "UNAUTHORIZED") return "Your session expired. Sign in again and retry.";
  if (error.code === "FORBIDDEN" && error.message === error.code) return "You no longer have permission to do that.";
  if (error.message && error.message !== error.code) return error.message;
  return fallback;
}

function recoveryFor(error: DomainError, returnTo?: string): ActionRecovery | undefined {
  if (error.code !== "UNAUTHORIZED") return undefined;
  return { label: "Sign in again", href: signInHref(returnTo ?? "/") };
}

export function fromThrown(error: unknown, fallback = "Unexpected error.", returnTo?: string): ActionFailure {
  if (isDomainError(error)) {
    return fail({ code: error.code, message: safeActionMessage(error, fallback) }, recoveryFor(error, returnTo));
  }
  return fail({ code: "CONFLICT", message: fallback });
}
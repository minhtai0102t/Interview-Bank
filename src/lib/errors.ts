export type DomainErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED";

const HTTP_STATUS = {
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
} as const satisfies Record<DomainErrorCode, number>;

/** An expected failure with a stable code, so callers decide what to show without parsing messages. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string = code, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DomainError";
    this.code = code;
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isDomainError(value: unknown, code?: DomainErrorCode): value is DomainError {
  return value instanceof DomainError && (code === undefined || value.code === code);
}

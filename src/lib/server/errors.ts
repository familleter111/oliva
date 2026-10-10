export type ErrorCode =
  | "non_authentifie"
  | "interdit"
  | "introuvable"
  | "invalide"
  | "conflit"
  | "limite"
  | "trop_volumineux"
  | "stockage"
  | "verrou"
  | "configuration";

const STATUS: Record<ErrorCode, number> = {
  non_authentifie: 401,
  interdit: 403,
  introuvable: 404,
  invalide: 422,
  conflit: 409,
  limite: 429,
  trop_volumineux: 413,
  stockage: 503,
  verrou: 503,
  configuration: 500,
};

/** Erreur métier affichable telle quelle à l'utilisateur (message en français, sans détail technique). */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(code: ErrorCode, message: string, opts: { details?: Record<string, string>; retryAfter?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = opts.details;
    this.retryAfter = opts.retryAfter;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError || (typeof e === "object" && e !== null && (e as { name?: string }).name === "AppError");
}

export const invalide = (message: string, details?: Record<string, string>) => new AppError("invalide", message, { details });
export const conflit = (message: string) => new AppError("conflit", message);
export const introuvable = (message = "Élément introuvable.") => new AppError("introuvable", message);

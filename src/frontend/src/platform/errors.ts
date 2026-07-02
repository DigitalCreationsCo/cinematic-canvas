/**
 * Normalized platform errors.
 *
 * Every platform implementation (desktop, web, test) converts its own
 * error types into `PlatformError` so that consumers never see Tauri
 * error strings, HTTP 500s, or mock infrastructure details.
 *
 * `PlatformErrorCode` mirrors the Rust `CommandError` variants in
 * `desktop/src-tauri/src/error.rs` but is language-agnostic.
 */

// ─── Error code enum ──────────────────────────────────────────────────

export enum PlatformErrorCode {
  Repo = "REPO",
  Asset = "ASSET",
  Vcs = "VCS",
  NotFound = "NOT_FOUND",
  Conflict = "CONFLICT",
  Io = "IO",
  Network = "NETWORK",
  Unsupported = "UNSUPPORTED",
  Other = "OTHER",
}

// ─── Error class ──────────────────────────────────────────────────────

export class PlatformError extends Error {
  public readonly code: PlatformErrorCode;
  public readonly context: Record<string, unknown> | undefined;

  constructor(
    code: PlatformErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlatformError";
    this.code = code;
    this.context = context;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PlatformError.prototype);
  }

  /** Returns a JSON-serialisable representation for logging. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }

  // ─── Convenience constructors ────────────────────────────────────

  static repo(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Repo, message, context);
  }

  static asset(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Asset, message, context);
  }

  static vcs(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Vcs, message, context);
  }

  static notFound(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.NotFound, message, context);
  }

  static conflict(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Conflict, message, context);
  }

  static io(message: string, context?: Record<string, unknown>): PlatformError {
    return new PlatformError(PlatformErrorCode.Io, message, context);
  }

  static network(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Network, message, context);
  }

  static unsupported(
    operation: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(
      PlatformErrorCode.Unsupported,
      `Operation '${operation}' is not supported on this platform`,
      { operation, ...context },
    );
  }

  static other(
    message: string,
    context?: Record<string, unknown>,
  ): PlatformError {
    return new PlatformError(PlatformErrorCode.Other, message, context);
  }
}

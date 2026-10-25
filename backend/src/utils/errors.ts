export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, statusCode = 400, code = "APP_ERROR", details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** 401 — `code` tells the client whether re-login is required (TOKEN_*) or not. */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/** 422 with a field → message map the UI binds to form inputs. */
export class ValidationError extends AppError {
  constructor(fieldErrors: Record<string, string>, message = "Please correct the highlighted fields") {
    super(message, 422, "VALIDATION_ERROR", { fieldErrors });
  }
}

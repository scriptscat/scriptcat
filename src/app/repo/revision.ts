export class RevisionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevisionConflictError";
  }
}

export function isRevisionConflict(error: unknown): error is RevisionConflictError {
  return error instanceof RevisionConflictError || (error as { name?: string })?.name === "RevisionConflictError";
}

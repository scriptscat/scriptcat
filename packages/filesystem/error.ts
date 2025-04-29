export class WarpTokenError {
  error: Error;

  constructor(error: Error) {
    this.error = error;
  }
}

export function isWarpTokenError(error: any): error is WarpTokenError {
  return error instanceof WarpTokenError;
}

export class WarpNetworkError {
  error: Error;

  constructor(error: Error) {
    this.error = error;
  }
}

export function isNetworkError(error: any): error is WarpNetworkError {
  return error instanceof WarpNetworkError;
}

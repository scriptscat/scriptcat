/** Transport failure: a request may have executed although its response was lost. */
export class MessageResponseLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageResponseLostError";
  }
}

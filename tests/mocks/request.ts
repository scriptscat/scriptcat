import { getMockBlobBytes, MockBlob } from "./blob";

export class MockRequest implements Request {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly bodyUsed: boolean = false;
  readonly signal: AbortSignal;
  readonly credentials: RequestCredentials = "same-origin";
  readonly cache: RequestCache = "default";
  readonly redirect: RequestRedirect = "follow";
  readonly referrer: string = "";
  readonly referrerPolicy: ReferrerPolicy = "";
  readonly integrity: string = "";
  readonly keepalive: boolean = false;
  readonly mode: RequestMode = "cors";
  readonly destination: RequestDestination = "";
  readonly isHistoryNavigation: boolean = false;
  readonly isReloadNavigation: boolean = false;
  // @ts-expect-error
  readonly body: ReadableStream<Uint8Array> | null;
  #bytes: Uint8Array | null;

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string") {
      this.url = new URL(input, "http://localhost").toString();
    } else if (input instanceof URL) {
      this.url = input.toString();
    } else if (input instanceof MockRequest) {
      this.url = input.url;
    } else {
      throw new TypeError("Invalid input for Request constructor");
    }

    this.method = (init?.method ?? (input instanceof MockRequest ? input.method : "GET")).toUpperCase();
    this.headers = new Headers(init?.headers ?? (input instanceof MockRequest ? input.headers : undefined));
    this.signal = init?.signal ?? (input instanceof MockRequest ? input.signal : new AbortController().signal);
    this.credentials = init?.credentials ?? (input instanceof MockRequest ? input.credentials : "same-origin");
    this.cache = init?.cache ?? (input instanceof MockRequest ? input.cache : "default");
    this.redirect = init?.redirect ?? (input instanceof MockRequest ? input.redirect : "follow");
    this.referrer = init?.referrer ?? (input instanceof MockRequest ? input.referrer : "");
    this.referrerPolicy = init?.referrerPolicy ?? (input instanceof MockRequest ? input.referrerPolicy : "");
    this.integrity = init?.integrity ?? (input instanceof MockRequest ? input.integrity : "");
    this.keepalive = init?.keepalive ?? (input instanceof MockRequest ? input.keepalive : false);
    this.mode = init?.mode ?? (input instanceof MockRequest ? input.mode : "cors");

    let bodyInit: BodyInit | null | undefined = init?.body ?? (input instanceof MockRequest ? input.body : null);
    if (["GET", "HEAD"].includes(this.method)) bodyInit = null;

    if (bodyInit instanceof Uint8Array) {
      this.#bytes = bodyInit;
    } else if (bodyInit instanceof ArrayBuffer) {
      this.#bytes = new Uint8Array(bodyInit);
    } else if (typeof bodyInit === "string") {
      this.#bytes = new TextEncoder().encode(bodyInit);
    } else if (bodyInit instanceof MockBlob) {
      this.#bytes = getMockBlobBytes(bodyInit); // Use public method
    } else if (bodyInit instanceof FormData || bodyInit instanceof URLSearchParams) {
      this.#bytes = new TextEncoder().encode(bodyInit.toString());
    } else {
      this.#bytes = null;
    }

    this.body = this.#bytes
      ? new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(this.#bytes!);
            controller.close();
          },
          pull: () => {
            (this as any).bodyUsed = true;
          },
          cancel: () => {
            (this as any).bodyUsed = true;
          },
        })
      : null;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    return this.#bytes?.slice().buffer ?? new ArrayBuffer(0);
  }

  async blob(): Promise<Blob> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    // @ts-expect-error
    return new MockBlob([this.#bytes ?? new Uint8Array(0)]);
  }

  async formData(): Promise<FormData> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    const formData = new FormData();
    if (this.#bytes) {
      const text = new TextDecoder().decode(this.#bytes);
      try {
        const params = new URLSearchParams(text);
        params.forEach((value, key) => formData.append(key, value));
      } catch {
        // Non-URLSearchParams body
      }
    }
    return formData;
  }

  async json(): Promise<any> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    if (!this.#bytes) return null;
    const text = new TextDecoder().decode(this.#bytes);
    try {
      return JSON.parse(text);
    } catch {
      throw new SyntaxError("Invalid JSON");
    }
  }

  async text(): Promise<string> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    return this.#bytes ? new TextDecoder().decode(this.#bytes) : "";
  }

  clone(): Request {
    if (this.bodyUsed) throw new TypeError("Cannot clone: Body already consumed");
    // @ts-expect-error
    return new MockRequest(this, {
      method: this.method,
      headers: this.headers,
      body: this.#bytes ? new Uint8Array(this.#bytes) : null,
      signal: this.signal,
      credentials: this.credentials,
      cache: this.cache,
      redirect: this.redirect,
      referrer: this.referrer,
      referrerPolicy: this.referrerPolicy,
      integrity: this.integrity,
      keepalive: this.keepalive,
      mode: this.mode,
    });
  }
}

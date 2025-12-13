import { getMockBlobBytes, MockBlob } from "./blob";

const mockNetworkResponses = new Map<string, any>();

export const setMockNetworkResponse = (url: string, v: any) => {
  mockNetworkResponses.set(url, v);
};

export const getMockNetworkResponse = (url: string) => {
  return mockNetworkResponses.get(url);
};

export class MockResponse implements Response {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly redirected: boolean = false;
  readonly type: ResponseType = "basic";
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array<ArrayBuffer>> | null;
  bodyUsed: boolean = false;
  #bytes: Uint8Array;

  constructor(body?: BodyInit | null, init?: ResponseInit & { url?: string }) {
    // Normalize body to bytes
    if (body instanceof Uint8Array) {
      this.#bytes = body;
    } else if (body instanceof ArrayBuffer) {
      this.#bytes = new Uint8Array(body);
    } else if (typeof body === "string") {
      this.#bytes = new TextEncoder().encode(body);
    } else if (body instanceof MockBlob) {
      this.#bytes = getMockBlobBytes(body); // Use public method
    } else if (body instanceof FormData || body instanceof URLSearchParams) {
      this.#bytes = new TextEncoder().encode(body.toString());
    } else {
      this.#bytes = new Uint8Array(0);
    }

    this.status = init?.status ?? 200;
    this.statusText = init?.statusText ?? (this.status === 200 ? "OK" : "");
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Headers(init?.headers);
    // Set Content-Type for Blob bodies if not provided
    if (body instanceof MockBlob && !this.headers.has("Content-Type")) {
      this.headers.set("Content-Type", body.type || "application/octet-stream");
    }
    this.url = init?.url ?? "";

    this.body = this.#bytes.length
      ? new ReadableStream<Uint8Array<ArrayBuffer>>({
          start: (controller) => {
            const buffer = new ArrayBuffer(this.#bytes.byteLength);
            const view = new Uint8Array(buffer);
            view.set(this.#bytes);
            controller.enqueue(view);
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
    return this.#bytes.slice().buffer;
  }

  async blob(): Promise<Blob> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    // @ts-expect-error
    return new MockBlob([this.#bytes], { type: this.headers.get("Content-Type") || "" });
  }

  async formData(): Promise<FormData> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    const formData = new FormData();
    if (this.#bytes.length) {
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
    if (!this.#bytes.length) return null;
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
    return new TextDecoder().decode(this.#bytes);
  }

  async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    if (this.bodyUsed) throw new TypeError("Body already consumed");
    (this as any).bodyUsed = true;
    const buffer = new ArrayBuffer(this.#bytes.byteLength);
    const view = new Uint8Array(buffer);
    view.set(this.#bytes);
    return view;
  }

  clone(): Response {
    if (this.bodyUsed) throw new TypeError("Cannot clone: Body already consumed");
    return new MockResponse(this.#bytes.slice(), {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      url: this.url,
    });
  }
}

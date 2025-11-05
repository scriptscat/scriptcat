import chromeMock from "@Packages/chrome-extension-mock";
import { initTestEnv } from "./utils";
import "@testing-library/jest-dom/vitest";
import { beforeAll, afterAll, vi } from "vitest";
import { getMockNetworkResponse } from "./shared";
import { setNetworkRequestCounter } from "@Packages/network-mock";

vi.stubGlobal("chrome", chromeMock);
chromeMock.init();
initTestEnv();

chromeMock.runtime.getURL = vi.fn().mockImplementation((path: string) => {
  return `chrome-extension://${chrome.runtime.id}${path}`;
});

const isPrimitive = (x: any) => x !== Object(x);

if (!("onanimationstart" in global)) {
  // Define or mock the global handler
  let val: any = null;
  Object.defineProperty(global, "onanimationstart", {
    configurable: true,
    enumerable: true,
    set(newVal) {
      if (isPrimitive(newVal)) newVal = null;
      val = newVal;
    },
    get() {
      return val;
    },
  });
}

//@ts-ignore
delete global.onload;

if (!("onload" in global)) {
  // Define or mock the global handler
  let val: any = null;
  Object.defineProperty(global, "onload", {
    configurable: true,
    enumerable: true,
    set(newVal) {
      if (isPrimitive(newVal)) newVal = null;
      val = newVal;
    },
    get() {
      return val;
    },
  });
}

//@ts-ignore
delete global.onresize;

if (!("onresize" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onresize", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onresize.set");
    },
    get() {
      console.log("测试用.onresize.get");
      return null;
    },
  });
}

//@ts-ignore
delete global.onblur;

if (!("onblur" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onblur", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onblur.set");
    },
    get() {
      console.log("测试用.onblur.get");
      return null;
    },
  });
}

//@ts-ignore
delete global.onfocus;

if (!("onblur" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onfocus", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onfocus.set");
    },
    get() {
      console.log("测试用.onfocus.get");
      return null;
    },
  });
}

Object.assign(global, {
  setTimeoutForTest(...args: any) {
    // 注意： function XXX (){} 会导致 Class prototype 出现
    //@ts-ignore
    if (typeof this === "object" && this && this !== global) throw new TypeError("Illegal invocation");
    //@ts-ignore
    return this.setTimeout(...args);
  },
});

vi.stubGlobal("sandboxTestValue", "sandboxTestValue");
vi.stubGlobal("sandboxTestValue2", "sandboxTestValue2");

vi.stubGlobal("ttest1", 1);
vi.stubGlobal("ttest2", 2);

// ---------------------------------------- Blob -------------------------------------------
// Keep originals to restore later
const realFetch = globalThis.fetch;
const realRequest = globalThis.Request;
const realResponse = globalThis.Response;
const RealBlob = globalThis.Blob;

// --- Mock Blob ---
interface BlobPropertyBag {
  type?: string;
}

/** Convert BlobPart[] to a single Uint8Array (UTF-8 for strings). */
function partsToUint8Array(parts: ReadonlyArray<BlobPart> | undefined): Uint8Array {
  if (!parts || parts.length === 0) return new Uint8Array(0);

  const enc = new TextEncoder();
  const toU8 = (part: BlobPart): Uint8Array => {
    if (part instanceof Uint8Array) return part;
    if (part instanceof ArrayBuffer) return new Uint8Array(part);
    if (ArrayBuffer.isView(part)) return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
    if (typeof part === "string") return enc.encode(part);
    return enc.encode(String(part));
  };

  const chunks = parts.map(toU8);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

beforeAll(() => {
  // --- Mock Blob ---
  const BaseBlob: typeof Blob =
    RealBlob ??
    class Blob {
      constructor(_parts?: BlobPart[], _options?: BlobPropertyBag) {}
      get size(): number {
        return 0;
      }
      get type(): string {
        return "";
      }
      async text(): Promise<string> {
        return "";
      }
      async arrayBuffer(): Promise<ArrayBuffer> {
        return new ArrayBuffer(0);
      }
      slice(): Blob {
        return new Blob();
      }
      stream(): ReadableStream<Uint8Array> {
        return new ReadableStream({
          start(controller) {
            controller.close();
          },
        });
      }
    };

  const mockBlobByteMap = new WeakMap();
  const getMockBlobBytes = (x: MockBlob) => {
    return mockBlobByteMap.get(x).slice(); // Return a copy to prevent mutation
  };
  class MockBlob extends BaseBlob {
    #data: Uint8Array;
    #type: string;
    #isConsumed: boolean = false;

    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      this.#data = partsToUint8Array(parts);
      this.#type = options?.type ? options.type.toLowerCase() : "";
      mockBlobByteMap.set(this, this.#data);
    }

    get size(): number {
      return this.#data.byteLength;
    }

    get type(): string {
      return this.#type;
    }

    async text(): Promise<string> {
      if (this.#isConsumed) throw new TypeError("Blob stream already consumed");
      return new TextDecoder().decode(this.#data);
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      if (this.#isConsumed) throw new TypeError("Blob stream already consumed");
      return this.#data.slice().buffer;
    }

    slice(a?: number, b?: number, contentType?: string): Blob {
      const normalizedStart = a == null ? 0 : a < 0 ? Math.max(this.size + a, 0) : Math.min(a, this.size);
      const normalizedEnd = b == null ? this.size : b < 0 ? Math.max(this.size + b, 0) : Math.min(b, this.size);
      const slicedData = this.#data.slice(normalizedStart, Math.max(normalizedEnd, normalizedStart));
      // @ts-expect-error
      return new MockBlob([slicedData], { type: contentType ?? this.#type });
    }

    // @ts-expect-error
    stream(): ReadableStream<Uint8Array> {
      if (this.#isConsumed) throw new TypeError("Blob stream already consumed");
      this.#isConsumed = true;
      return new ReadableStream<Uint8Array>({
        start: (controller) => {
          if (this.#data.length) controller.enqueue(this.#data);
          controller.close();
        },
      });
    }
    // @ts-expect-error
    async bytes(): Promise<Uint8Array> {
      if (this.#isConsumed) throw new TypeError("Blob stream already consumed");
      return this.#data.slice();
    }
  }

  // --- Mock Request ---
  class MockRequest implements Request {
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

  // --- Mock Response ---
  class MockResponse implements Response {
    readonly ok: boolean;
    readonly status: number;
    readonly statusText: string;
    readonly url: string;
    readonly redirected: boolean = false;
    readonly type: ResponseType = "basic";
    readonly headers: Headers;
    // @ts-expect-error
    readonly body: ReadableStream<Uint8Array> | null;
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
        ? new ReadableStream<Uint8Array>({
            start: (controller) => {
              controller.enqueue(this.#bytes);
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

    clone(): Response {
      if (this.bodyUsed) throw new TypeError("Cannot clone: Body already consumed");
      // @ts-expect-error
      return new MockResponse(this.#bytes.slice(), {
        status: this.status,
        statusText: this.statusText,
        headers: this.headers,
        url: this.url,
      });
    }
  }

  // --- Mock Fetch ---
  const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof MockRequest ? input : new MockRequest(input, init);

    // Check for abort
    if (request.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // Get mock response
    const { data, contentType, blob } = getMockNetworkResponse(request.url);
    const body = blob ? new MockBlob([data], { type: contentType }) : data;

    const ret = new MockResponse(body, {
      status: 200,
      headers: { "Content-Type": contentType },
      url: request.url,
    });

    if (typeof input === "string") {
      setNetworkRequestCounter(input);
    }

    // @ts-expect-error
    return ret;
  });

  // Install globals
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("Request", MockRequest);
  vi.stubGlobal("Response", MockResponse);
  vi.stubGlobal("Blob", MockBlob);
});

afterAll(() => {
  // Restore originals
  vi.stubGlobal("fetch", realFetch);
  vi.stubGlobal("Request", realRequest);
  vi.stubGlobal("Response", realResponse);
  vi.stubGlobal("Blob", RealBlob ?? undefined);
});
vi.stubGlobal("define", "特殊关键字不能穿透沙盒");

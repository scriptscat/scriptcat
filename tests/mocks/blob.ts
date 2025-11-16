export const RealBlob = globalThis.Blob;

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
}

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

const BaseBlob: typeof Blob = RealBlob ?? Blob;

const mockBlobByteMap = new WeakMap();

export const getMockBlobBytes = (x: MockBlob) => {
  return mockBlobByteMap.get(x).slice(); // Return a copy to prevent mutation
};

export class MockBlob extends BaseBlob {
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
    return new MockBlob([slicedData], { type: contentType ?? this.#type });
  }

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

  async bytes(): Promise<Uint8Array> {
    if (this.#isConsumed) throw new TypeError("Blob stream already consumed");
    return this.#data.slice();
  }
}

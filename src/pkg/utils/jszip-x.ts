import { ZipWriter, openZip } from "web-jszipp";
import type { ZipCompressionMethod, ZipRandomAccessReader, ZipWriterOutput } from "web-jszipp";

type Compression = "STORE" | "DEFLATE";

interface CompressionOptions {
  level: number;
}

interface InputByType {
  string: string;
  text: string;
  uint8array: Uint8Array<ArrayBuffer>;
  arraybuffer: ArrayBuffer;
  blob: Blob;
}

type InputFileFormat = InputByType[keyof InputByType] | Promise<InputByType[keyof InputByType]>;

type ZipEntryData = string | Uint8Array<ArrayBuffer> | ArrayBuffer | Blob;

export interface JSZipFileOptions {
  date?: Date;
}

export interface JSZipGenerateOptions {
  type: "blob" | "uint8array" | "arraybuffer";
  compression?: Compression | null; // default null
  compressionOptions?: CompressionOptions | null; // default null
  comment?: string | null; // default null; for entire zip file
}

export class JSZippZipObject {
  name: string;

  date: Date;

  private content: ZipEntryData;

  constructor(name: string, content: ZipEntryData, date?: Date) {
    this.name = name;
    this.content = content;
    this.date = date || new Date();
  }

  async async(type: "string"): Promise<string>;

  async async(type: "blob"): Promise<Blob>;

  async async(type: "string" | "blob"): Promise<string | Blob>;

  async async(type: "string" | "blob" = "string"): Promise<string | Blob> {
    if (type === "blob") {
      return this.toBlob();
    }
    return new TextDecoder().decode(await this.toUint8Array());
  }

  getContent() {
    return this.content;
  }

  private async toUint8Array(): Promise<Uint8Array<ArrayBuffer>> {
    return toUint8Array(this.content);
  }

  private async toBlob(): Promise<Blob> {
    if (typeof Blob !== "undefined" && this.content instanceof Blob) {
      return this.content;
    }
    return new Blob([await this.toUint8Array()]);
  }
}

export class JSZippZipFile {
  files: Record<string, JSZippZipObject> = {};

  file(path: string): JSZippZipObject | null;

  file(path: string, content: ZipEntryData, options?: JSZipFileOptions): this;

  file(path: string, content?: ZipEntryData, options?: JSZipFileOptions): JSZippZipObject | this | null {
    if (content === undefined) {
      return this.files[path] || null;
    }
    this.files[path] = new JSZippZipObject(path, content, options?.date);
    return this;
  }

  remove(path: string) {
    delete this.files[path];
    return this;
  }

  async loadAsync(content: InputFileFormat): Promise<this> {
    const reader: ZipRandomAccessReader = await openZip(await toZipSource(await content), { pathMode: "unsafe" });
    this.files = {};
    try {
      for (const entry of reader.entries) {
        if (entry.isDirectory) {
          continue;
        }
        this.files[entry.path] = new JSZippZipObject(entry.path, await entry.bytes(), entry.modifiedAt);
      }
    } finally {
      await reader.close();
    }
    return this;
  }

  generateAsync(options: JSZipGenerateOptions & { type: "blob" }): Promise<Blob>;

  generateAsync(options: JSZipGenerateOptions & { type: "uint8array" }): Promise<Uint8Array<ArrayBuffer>>;

  generateAsync(options: JSZipGenerateOptions & { type: "arraybuffer" }): Promise<ArrayBuffer>;

  async generateAsync(options: JSZipGenerateOptions): Promise<Blob | Uint8Array<ArrayBuffer> | ArrayBuffer> {
    const method = getCompressionMethod(options);
    const writer = new ZipWriter({
      outputAs: options.type as ZipWriterOutput,
      level: getLevel(options),
      comment: options.comment || undefined,
    });

    for (const [path, file] of Object.entries(this.files)) {
      await writer.add({
        path,
        data: file.getContent(),
        method,
        meta: { modifiedAt: file.date },
      });
    }

    return writer.close() as Promise<Blob | Uint8Array<ArrayBuffer> | ArrayBuffer>;
  }
}

export const createJSZip = () => {
  return new JSZippZipFile();
};

export const loadAsyncJSZip = async (content: InputFileFormat): Promise<JSZipFile> => {
  return createJSZip().loadAsync(content);
};

export type JSZipFile = JSZippZipFile;

export type JSZipObject = JSZippZipObject;

function getCompressionMethod(options: { compression?: Compression | null }): ZipCompressionMethod | undefined {
  switch (options.compression) {
    case "STORE":
      return "store";
    case "DEFLATE":
      return "deflate";
    default:
      return undefined;
  }
}

function getLevel(options: { compression?: Compression | null; compressionOptions?: CompressionOptions | null }) {
  if (options.compression === "STORE") {
    return 0;
  }
  const level = options.compressionOptions?.level;
  if (level === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(9, level));
}

async function toZipSource(
  content: InputByType[keyof InputByType]
): Promise<Blob | Uint8Array<ArrayBuffer> | ArrayBuffer> {
  if (typeof content === "string") {
    return new TextEncoder().encode(content) as Uint8Array<ArrayBuffer>;
  }
  if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
    return content;
  }
  if (typeof Blob !== "undefined" && content instanceof Blob) {
    return content;
  }
  return new TextEncoder().encode(String(content)) as Uint8Array<ArrayBuffer>;
}

async function toUint8Array(content: ZipEntryData): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof content === "string") {
    return new TextEncoder().encode(content) as Uint8Array<ArrayBuffer>;
  }
  if (content instanceof Uint8Array) {
    return content as Uint8Array<ArrayBuffer>;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (typeof Blob !== "undefined" && content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }
  return new TextEncoder().encode(String(content)) as Uint8Array<ArrayBuffer>;
}

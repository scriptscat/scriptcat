import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Unzipped, ZipOptions, Zippable, ZippableFile } from "fflate";

type Compression = "STORE" | "DEFLATE";

const ZIP_MIME_TYPE = "application/zip";

interface CompressionOptions {
  level: number;
}

interface InputByType {
  string: string;
  text: string;
  uint8array: Uint8Array;
  arraybuffer: ArrayBuffer;
  blob: Blob;
}

type InputFileFormat = InputByType[keyof InputByType] | Promise<InputByType[keyof InputByType]>;

export interface JSZipFileOptions {
  date?: Date;
}

export interface JSZipGenerateOptions {
  type: "blob" | "uint8array" | "arraybuffer";
  compression?: Compression | null; // default null
  compressionOptions?: CompressionOptions | null; // default null
  comment?: string | null; // default null; for entire zip file
}

export class FflateZipObject {
  name: string;

  date: Date;

  private content: Uint8Array;

  constructor(name: string, content: Uint8Array, date?: Date) {
    this.name = name;
    this.content = content;
    this.date = date || new Date();
  }

  async async(type: "string" | "blob" = "string"): Promise<string | Blob> {
    if (type === "blob") {
      return new Blob([toArrayBuffer(this.content)]);
    }
    return strFromU8(this.content);
  }

  getContent() {
    return this.content;
  }
}

export class FflateZipFile {
  files: Record<string, FflateZipObject> = {};

  file(path: string): FflateZipObject | null;

  file(path: string, content: string | Uint8Array | Blob, options?: JSZipFileOptions): this;

  file(path: string, content?: string | Uint8Array | Blob, options?: JSZipFileOptions): FflateZipObject | this | null {
    if (content === undefined) {
      return this.files[path] || null;
    }
    this.files[path] = new FflateZipObject(path, toUint8ArraySync(content), options?.date);
    return this;
  }

  remove(path: string) {
    delete this.files[path];
    return this;
  }

  async loadAsync(content: InputFileFormat): Promise<this> {
    const zipContent = await toUint8Array(await content);
    const zipDates = getZipEntryDates(zipContent);
    const files: Unzipped = unzipSync(zipContent);
    this.files = {};
    for (const [path, fileContent] of Object.entries(files)) {
      this.files[path] = new FflateZipObject(path, fileContent, zipDates.get(path));
    }
    return this;
  }

  generateAsync(options: JSZipGenerateOptions & { type: "blob" }): Promise<Blob>;

  generateAsync(options: JSZipGenerateOptions & { type: "uint8array" }): Promise<Uint8Array>;

  generateAsync(options: JSZipGenerateOptions & { type: "arraybuffer" }): Promise<ArrayBuffer>;

  async generateAsync(options: JSZipGenerateOptions): Promise<Blob | Uint8Array | ArrayBuffer> {
    const comment = options?.comment || undefined;
    const level = getLevel(options);
    const data: Zippable = {};
    const entries = Object.entries(this.files);
    if (entries.length > 65535) {
      // see https://github.com/101arrowz/fflate/issues/229
      // see https://github.com/101arrowz/fflate/pull/230
      // see https://github.com/101arrowz/fflate/pull/270
      throw new Error("NOT IMPLEMENTED YET: creating ZIP archives that contain more than 65,535 entries");
    }
    for (const [path, file] of entries) {
      const zippableFile: ZippableFile = [
        file.getContent(),
        {
          level,
          mtime: file.date,
        },
      ];
      data[path] = zippableFile;
    }
    let output: Uint8Array<ArrayBuffer> = zipSync(data, { level });
    if (comment) {
      try {
        output = addZipArchiveComment(output, comment);
      } catch (e) {
        console.error("Unable to add zip comment", e);
      }
    }
    switch (options.type) {
      case "blob":
        return new Blob([toArrayBuffer(output)], { type: ZIP_MIME_TYPE });
      case "arraybuffer":
        return toArrayBuffer(output);
      case "uint8array":
      default:
        return output;
    }
  }
}

export const createJSZip = () => {
  return new FflateZipFile();
};

export const loadAsyncJSZip = async (content: InputFileFormat): Promise<JSZipFile> => {
  return createJSZip().loadAsync(content);
};

export type JSZipFile = FflateZipFile;

export type JSZipObject = FflateZipObject;

/**
 * Adds (or replaces) the archive-level comment of a ZIP file by patching its
 * End of Central Directory (EOCD) record.
 *
 * fflate has no built-in API for the archive comment (its `comment` option is
 * per-entry), so this rewrites the EOCD directly: it locates the EOCD, updates
 * the 2-byte comment-length field, and appends the new comment bytes. Any
 * existing archive comment is discarded.
 *
 * Also see {@link https://github.com/101arrowz/fflate/issues/269}
 *
 * The EOCD is located by scanning backward for its signature (`50 4b 05 06`)
 * and validating each candidate against `offset + 22 + declaredCommentLength
 * === zip.length`. This prevents matching signature bytes that happen to appear
 * inside file data or an existing comment, so the function is safe to apply to
 * its own output (idempotent re-stamping).
 *
 * The comment is stored as raw UTF-8 bytes with no language-encoding flag,
 * which is the de-facto convention honored by common readers.
 *
 * @param zip - A standard (non-ZIP64) ZIP archive, e.g. the output of fflate's
 *   `zipSync` / `zip`.
 * @param comment - The archive comment to set. Encoded to UTF-8; an empty
 *   string clears any existing comment.
 * @returns A new `Uint8Array` containing the archive with the updated comment.
 *   The input is not mutated.
 *
 * @throws {Error} If the UTF-8-encoded comment exceeds 65,535 bytes (the
 *   maximum the 2-byte EOCD length field can represent).
 * @throws {Error} If the input is too short to contain an EOCD record.
 * @throws {Error} If no valid EOCD record can be found.
 *
 * @remarks
 * Only standard ZIP archives are supported; ZIP64 (EOCD64) is not handled.
 * This is not a concern for typical `zipSync` output, which does not emit
 * ZIP64 under normal entry counts and sizes.
 *
 * @example
 * ```ts
 * const zip = zipSync({ "hello.txt": strToU8("hello") });
 * const withComment = addZipArchiveComment(zip, "built by my tool");
 * ```
 */
export function addZipArchiveComment(zip: Uint8Array<ArrayBuffer>, comment: string): Uint8Array<ArrayBuffer> {
  const commentBytes = strToU8(comment);

  if (commentBytes.length > 0xffff) {
    throw new Error("ZIP archive comment must be <= 65,535 bytes");
  }

  // End of Central Directory:
  // signature: 50 4b 05 06
  // fixed size before comment: 22 bytes
  const EOCD_SIZE = 22;
  const len = zip.length;

  if (len < EOCD_SIZE) {
    throw new Error("Invalid ZIP: too short to contain EOCD");
  }

  // Scan backward for the EOCD signature. The real EOCD's comment field must
  // extend exactly to EOF (offset + 22 + declaredCommentLength === len), which
  // rejects stray signature bytes inside file data or an existing comment.
  const searchStart = Math.max(0, len - EOCD_SIZE - 0xffff);

  let eocd = -1;

  for (let i = len - EOCD_SIZE; i >= searchStart; i--) {
    if (
      zip[i] === 0x50 &&
      zip[i + 1] === 0x4b &&
      zip[i + 2] === 0x05 &&
      zip[i + 3] === 0x06 &&
      // Critical validation: this candidate EOCD must account for the
      // entire remaining tail of the file.
      i + EOCD_SIZE + (zip[i + 20] | (zip[i + 21] << 8)) === len
    ) {
      eocd = i;
      break;
    }
  }

  if (eocd < 0) {
    throw new Error("Could not find valid ZIP End of Central Directory record");
  }

  const tail = eocd + EOCD_SIZE;
  const out = new Uint8Array(tail + commentBytes.length);

  // Copy ZIP through EOCD fixed fields, excluding old archive comment.
  out.set(zip.subarray(0, tail));

  // EOCD archive comment length at offset +20, little-endian.
  out[eocd + 20] = commentBytes.length & 0xff;
  out[eocd + 21] = commentBytes.length >>> 8;

  // Append new archive comment.
  out.set(commentBytes, tail);

  return out;
}

function getLevel(options: { compression?: Compression | null; compressionOptions?: CompressionOptions | null }) {
  if (options.compression === "STORE") {
    return 0 satisfies ZipOptions["level"];
  }
  const level = options.compressionOptions?.level;
  if (level === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(9, level)) as ZipOptions["level"];
}

function toUint8ArraySync(content: string | Uint8Array | Blob): Uint8Array {
  if (typeof content === "string") {
    return strToU8(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  throw new Error("Blob content must be loaded asynchronously before creating a ZIP");
}

async function toUint8Array(content: InputByType[keyof InputByType]): Promise<Uint8Array> {
  if (typeof content === "string") {
    return strToU8(content);
  }
  if (content instanceof Uint8Array) {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  if (content instanceof Blob) {
    return new Uint8Array(await content.arrayBuffer());
  }
  return strToU8(String(content));
}

function getZipEntryDates(data: Uint8Array): Map<string, Date> {
  const dates = new Map<string, Date>();
  let endOffset = data.length - 22;
  for (; endOffset >= 0 && readUint32(data, endOffset) !== 0x06054b50; endOffset -= 1) {
    if (data.length - endOffset > 65558) {
      return dates;
    }
  }
  if (endOffset < 0) {
    return dates;
  }
  const entryCount = readUint16(data, endOffset + 10);
  let offset = readUint32(data, endOffset + 16);
  for (let i = 0; i < entryCount && readUint32(data, offset) === 0x02014b50; i += 1) {
    const flags = readUint16(data, offset + 8);
    const modTime = readUint16(data, offset + 12);
    const modDate = readUint16(data, offset + 14);
    const filenameLength = readUint16(data, offset + 28);
    const extraLength = readUint16(data, offset + 30);
    const commentLength = readUint16(data, offset + 32);
    const filename = strFromU8(data.subarray(offset + 46, offset + 46 + filenameLength), !(flags & 2048));
    dates.set(filename, dosDateTimeToDate(modDate, modTime));
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  return dates;
}

function dosDateTimeToDate(dosDate: number, dosTime: number): Date {
  const year = ((dosDate >> 9) & 0x7f) + 1980;
  const month = ((dosDate >> 5) & 0x0f) - 1;
  const day = dosDate & 0x1f;
  const hours = (dosTime >> 11) & 0x1f;
  const minutes = (dosTime >> 5) & 0x3f;
  const seconds = (dosTime & 0x1f) * 2;
  return new Date(year, month, day, hours, minutes, seconds);
}

function readUint16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readUint32(data: Uint8Array, offset: number): number {
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

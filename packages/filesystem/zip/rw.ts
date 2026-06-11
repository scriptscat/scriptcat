import type { JSZipFileOptions, JSZipFile, JSZipObject } from "@App/pkg/utils/jszip-x";
import type { FileCreateOptions, FileReader, FileWriter } from "../filesystem";

export class ZipFileReader implements FileReader {
  zipObject: JSZipObject;

  constructor(zipObject: JSZipObject) {
    this.zipObject = zipObject;
  }

  read(type?: "string" | "blob"): Promise<string | Blob> {
    return this.zipObject.async(type || "string");
  }
}

export class ZipFileWriter implements FileWriter {
  zip: JSZipFile;

  path: string;

  modifiedDate: number | undefined;

  constructor(zip: JSZipFile, path: string, opts?: FileCreateOptions) {
    this.zip = zip;
    this.path = path;
    if (opts && opts.modifiedDate) {
      this.modifiedDate = opts.modifiedDate;
    }
  }

  async write(content: string | Blob): Promise<void> {
    const opts = {} as JSZipFileOptions;
    if (this.modifiedDate) {
      opts.date = new Date(this.modifiedDate);
      // jszipp does not require timezone adjustment to UTC Date
    }
    const fileData = typeof content === "string" ? content : new Uint8Array(await content.arrayBuffer());
    this.zip.file(this.path, fileData, opts);
  }
}

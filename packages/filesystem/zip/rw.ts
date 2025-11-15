import type { JSZipObject } from "jszip";
import type { JSZipFileOptions, JSZipFile } from "@App/pkg/utils/jszip-x";
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

  async write(content: string): Promise<void> {
    const opts = {} as JSZipFileOptions;
    if (this.modifiedDate) {
      const date = new Date(this.modifiedDate);
      const dateWithOffset = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      opts.date = dateWithOffset;
    }
    this.zip.file(this.path, content, opts);
  }
}

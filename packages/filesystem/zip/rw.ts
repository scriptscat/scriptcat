import type { JSZipObject } from "jszip";
import type JSZip from "jszip";
import type { FileReader, FileWriter } from "../filesystem";

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
  zip: JSZip;

  path: string;

  constructor(zip: JSZip, path: string) {
    this.zip = zip;
    this.path = path;
  }

  async write(content: string): Promise<void> {
    this.zip.file(this.path, content);
  }
}

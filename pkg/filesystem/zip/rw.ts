/* eslint-disable max-classes-per-file */
/* eslint-disable import/prefer-default-export */
import JSZip, { JSZipObject } from "jszip";
import { FileReader, FileWriter } from "../filesystem";

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

  write(content: string): Promise<void> {
    this.zip.file(this.path, content);
    return Promise.resolve();
  }
}

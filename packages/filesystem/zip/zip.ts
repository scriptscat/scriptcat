import { type JSZipFile } from "@App/pkg/utils/jszip-x";
import type { File, FileCreateOptions, FileReader, FileWriter } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import { ZipFileReader, ZipFileWriter } from "./rw";

export default class ZipFileSystem implements FileSystem {
  zip: JSZipFile;

  basePath: string;

  // zip为空时，创建一个空的zip
  constructor(zip: JSZipFile, basePath?: string) {
    this.zip = zip;
    this.basePath = basePath || "";
  }

  async verify(): Promise<void> {
    // do nothing
  }

  async open(info: File): Promise<FileReader> {
    const path = info.name;
    const file = this.zip.file(path);
    if (file) {
      return new ZipFileReader(file);
    }
    throw new Error("File not found");
  }

  async openDir(path: string): Promise<FileSystem> {
    return new ZipFileSystem(this.zip, path);
  }

  async create(path: string, opts?: FileCreateOptions): Promise<FileWriter> {
    return new ZipFileWriter(this.zip, path, opts);
  }

  async createDir(_path: string, _opts?: FileCreateOptions): Promise<void> {
    // do nothing
  }

  async delete(path: string): Promise<void> {
    this.zip.remove(path);
  }

  async list(): Promise<File[]> {
    const files: File[] = [];
    for (const [filename, jsZipObject] of Object.entries(this.zip.files)) {
      const date = jsZipObject.date; // the last modification date
      const dateWithOffset = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
      const lastModificationDate = dateWithOffset.getTime();
      files.push({
        name: filename,
        path: filename,
        size: 0,
        digest: "",
        createtime: lastModificationDate,
        updatetime: lastModificationDate,
      });
    }
    return files;
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

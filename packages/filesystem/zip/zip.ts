import type JSZip from "jszip";
import type { FileInfo, FileReader, FileWriter } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import { ZipFileReader, ZipFileWriter } from "./rw";

export default class ZipFileSystem implements FileSystem {
  zip: JSZip;

  basePath: string;

  // zip为空时，创建一个空的zip
  constructor(zip: JSZip, basePath?: string) {
    this.zip = zip;
    this.basePath = basePath || "";
  }

  async verify(): Promise<void> {
    // do nothing
  }

  async open(info: FileInfo): Promise<FileReader> {
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

  async create(path: string): Promise<FileWriter> {
    return new ZipFileWriter(this.zip, path);
  }

  async createDir(): Promise<void> {
    // do nothing
  }

  async delete(path: string): Promise<void> {
    this.zip.remove(path);
  }

  async list(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    for (const [filename, details] of Object.entries(this.zip.files)) {
      const time = details.date.getTime();
      files.push({
        name: filename,
        path: filename,
        size: 0,
        digest: "",
        createtime: time,
        updatetime: time,
      });
    }
    return files;
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

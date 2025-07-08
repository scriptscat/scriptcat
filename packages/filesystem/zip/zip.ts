import JSZip from "jszip";
import type { File, FileReader, FileWriter } from "@Packages/filesystem/filesystem";
import type FileSystem from "@Packages/filesystem/filesystem";
import { ZipFileReader, ZipFileWriter } from "./rw";

export default class ZipFileSystem implements FileSystem {
  zip: JSZip;

  basePath: string;

  // zip为空时，创建一个空的zip
  constructor(zip?: JSZip, basePath?: string) {
    this.zip = zip || new JSZip();
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

  async create(path: string): Promise<FileWriter> {
    return new ZipFileWriter(this.zip, path);
  }

  async createDir(): Promise<void> {
    // do nothing
  }

  async delete(path: string): Promise<void> {
    this.zip.remove(path);
  }

  async list(): Promise<File[]> {
    const files: File[] = [];
    Object.keys(this.zip.files).forEach((key) => {
      files.push({
        name: key,
        path: key,
        size: 0,
        digest: "",
        createtime: this.zip.files[key].date.getTime(),
        updatetime: this.zip.files[key].date.getTime(),
      });
    });
    return files;
  }

  async getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

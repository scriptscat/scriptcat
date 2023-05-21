import JSZip from "jszip";
import FileSystem, {
  File,
  FileReader,
  FileWriter,
} from "@Pkg/filesystem/filesystem";
import { ZipFileReader, ZipFileWriter } from "./rw";

export default class ZipFileSystem implements FileSystem {
  zip: JSZip;

  basePath: string;

  // zip为空时，创建一个空的zip
  constructor(zip?: JSZip, basePath?: string) {
    this.zip = zip || new JSZip();
    this.basePath = basePath || "";
  }

  verify(): Promise<void> {
    return Promise.resolve();
  }

  open(info: File): Promise<FileReader> {
    const path = info.name;
    const file = this.zip.file(path);
    if (file) {
      return Promise.resolve(new ZipFileReader(file));
    }
    return Promise.reject(new Error("File not found"));
  }

  openDir(path: string): Promise<FileSystem> {
    return Promise.resolve(new ZipFileSystem(this.zip, path));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new ZipFileWriter(this.zip, path));
  }

  createDir(): Promise<void> {
    return Promise.resolve();
  }

  delete(path: string): Promise<void> {
    this.zip.remove(path);
    return Promise.resolve();
  }

  list(): Promise<File[]> {
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
    return Promise.resolve(files);
  }

  getDirUrl(): Promise<string> {
    throw new Error("Method not implemented.");
  }
}

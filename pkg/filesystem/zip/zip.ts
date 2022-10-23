import JSZip from "jszip";
import { File, FileReader, FileSystem, FileWriter } from "../filesystem";
import { ZipFileReader, ZipFileWriter } from "./rw";

export default class ZipFileSystem implements FileSystem {
  zip: JSZip;

  // zip为空时，创建一个空的zip
  constructor(zip?: JSZip) {
    this.zip = zip || new JSZip();
  }

  open(path: string): Promise<FileReader> {
    const file = this.zip.file(path);
    if (file) {
      return Promise.resolve(new ZipFileReader(file));
    }
    return Promise.reject(new Error("File not found"));
  }

  create(path: string): Promise<FileWriter> {
    return Promise.resolve(new ZipFileWriter(this.zip, path));
  }

  list(path?: string): Promise<File[]> {
    const files: File[] = [];
    Object.keys(this.zip.files).forEach((key) => {
      if (path && !key.startsWith(path)) {
        return;
      }
      files.push({
        name: key,
        path: key,
        size: 0,
        createtime: this.zip.files[key].date.getTime(),
        updatetime: this.zip.files[key].date.getTime(),
      });
    });
    return Promise.resolve(files);
  }
}

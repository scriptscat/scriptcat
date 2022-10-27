import JSZip from "jszip";
import FileSystem, {
  File,
  FileReader,
  FileWriter,
} from "@Pkg/filesystem/filesystem";
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

  delete(path: string): Promise<void> {
    this.zip.remove(path);
    return Promise.resolve();
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

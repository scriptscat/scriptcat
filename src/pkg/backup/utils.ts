import ZipFileSystem from "@Packages/filesystem/zip/zip";
import JSZip from "jszip";
import BackupImport from "./import";

// 解析备份文件
export function parseBackupZipFile(zip: JSZip) {
  const fs = new ZipFileSystem(zip);
  // 解析文件
  return new BackupImport(fs).parse();
}

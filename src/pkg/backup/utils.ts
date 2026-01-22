import ZipFileSystem from "@Packages/filesystem/zip/zip";
import { type JSZipFile } from "@App/pkg/utils/jszip-x";
import BackupImport from "./import";

// 解析备份文件
export function parseBackupZipFile(zip: JSZipFile) {
  const fs = new ZipFileSystem(zip);
  // 解析文件
  return new BackupImport(fs).parse();
}

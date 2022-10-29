export interface File {
  // 文件名
  name: string;
  // 文件路径
  path: string;
  // 文件大小
  size: number;
  // 文件摘要
  digest: string;
  // 文件创建时间
  createtime: number;
  // 文件修改时间
  updatetime: number;
}

export interface FileReader {
  // 读取文件内容
  read<T extends "string" | "blob">(type?: T): Promise<string | Blob>;
}

export interface FileWriter {
  // 写入文件内容
  write(content: string | Blob): Promise<void>;
}

export type FileReadWriter = FileReader & FileWriter;

// 文件读取
export default interface FileSystem {
  // 授权验证
  verify(): Promise<void>;
  // 打开文件
  open(path: string): Promise<FileReader>;
  // 创建文件
  create(path: string): Promise<FileWriter>;
  // 删除文件
  delete(path: string): Promise<void>;
  // 文件列表
  list(path?: string): Promise<File[]>;
}

import type FileSystem from "./filesystem";
import type { File, FileReader, FileWriter } from "./filesystem";

/**
 * 速率限制器
 * 控制并发操作数量，防止过多并发请求
 */
export class RateLimiter {
  private queue: Array<() => void> = [];

  private running = 0;

  private maxConcurrent: number;

  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 执行限速操作
   * @param fn 要执行的操作函数
   * @returns 操作结果
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 如果当前运行的操作数已达到上限，则等待
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      // 执行完成后，从队列中取出下一个等待的操作
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

// 文件系统限速器，防止并发请求过多达到服务器限制
// 也防止上传/下载带宽占用过多超时导致失败/数据不全的问题
export default class LimiterFileSystem implements FileSystem {
  private fs: FileSystem;

  private limiter: RateLimiter;

  constructor(fs: FileSystem, limiter?: RateLimiter) {
    this.fs = fs;
    this.limiter = limiter || new RateLimiter();
  }

  verify(): Promise<void> {
    return this.limiter.execute(() => this.fs.verify());
  }

  async open(file: File): Promise<FileReader> {
    const reader = await this.fs.open(file);
    return {
      read: (type) => this.limiter.execute(() => reader.read(type)),
    };
  }

  async openDir(path: string): Promise<FileSystem> {
    return this.limiter.execute(async () => {
      const fs = await this.fs.openDir(path);
      return new LimiterFileSystem(fs, this.limiter);
    });
  }

  async create(path: string): Promise<FileWriter> {
    const writer = await this.fs.create(path);
    return {
      write: (content) => this.limiter.execute(() => writer.write(content)),
    };
  }

  createDir(dir: string): Promise<void> {
    return this.limiter.execute(() => this.fs.createDir(dir));
  }

  delete(path: string): Promise<void> {
    return this.limiter.execute(() => this.fs.delete(path));
  }

  list(): Promise<File[]> {
    return this.limiter.execute(() => this.fs.list());
  }

  getDirUrl(): Promise<string> {
    return this.limiter.execute(() => this.fs.getDirUrl());
  }
}

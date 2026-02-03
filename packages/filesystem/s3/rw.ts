import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { FileReader, FileWriter } from "../filesystem";

/**
 * FileReader implementation for Amazon S3.
 * Downloads and reads file content from S3.
 */
export class S3FileReader implements FileReader {
  client: S3Client;

  bucket: string;

  key: string;

  constructor(client: S3Client, bucket: string, key: string) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
  }

  /**
   * Reads file content from S3.
   * @param type - Output format: "string" for text, "blob" for binary (default)
   * @returns File content as string or Blob
   * @throws {Error} If file not found or read fails
   */
  async read(type?: "string" | "blob"): Promise<string | Blob> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error("Empty response body from S3");
      }

      // Convert the stream to the requested format
      const chunks: Uint8Array[] = [];
      const reader = response.Body.transformToWebStream().getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      switch (type) {
        case "string":
          return new TextDecoder().decode(result);
        default:
          return new Blob([result]);
      }
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        throw new Error(`File not found: ${this.key}`);
      }
      throw error;
    }
  }
}

/**
 * FileWriter implementation for Amazon S3.
 * Uploads file content to S3 with optional metadata.
 */
export class S3FileWriter implements FileWriter {
  client: S3Client;

  bucket: string;

  key: string;

  modifiedDate?: number;

  constructor(client: S3Client, bucket: string, key: string, modifiedDate?: number) {
    this.client = client;
    this.bucket = bucket;
    this.key = key;
    this.modifiedDate = modifiedDate;
  }

  /**
   * Writes content to S3.
   * @param content - File content as string or Blob
   * @throws {Error} If upload fails
   */
  async write(content: string | Blob): Promise<void> {
    const body = content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : content;

    const metadata: Record<string, string> = {};
    if (this.modifiedDate) {
      metadata.createtime = this.modifiedDate.toString();
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key,
      Body: body,
      Metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    await this.client.send(command);
  }
}

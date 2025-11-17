/**
 *
 * JSZIP 由于不再更新，问题只能手改。
 *
 * UTC时间问题
 * https://github.com/Stuk/jszip/issues/369#issuecomment-546204220
 * https://blog.csdn.net/weixin_45410246/article/details/150015478
 *
 * Typescript: Fix missing types for JSZip.defaults
 * https://github.com/Stuk/jszip/pull/927
 * https://github.com/Stuk/jszip/issues/690
 *
 *
 * 日后应考虑 fork 一下加入以下PR
 *
 * 修正单一档案不能大于 2GB
 * https://github.com/Stuk/jszip/pull/791
 *
 *
 * 其他参考：
 * https://greasyfork.org/scripts/526002-gitzip-lite/code
 *
 */
import JSZip from "jszip";

type Compression = "STORE" | "DEFLATE";

interface CompressionOptions {
  level: number;
}

interface InputByType {
  base64: string;
  string: string;
  text: string;
  binarystring: string;
  array: number[];
  uint8array: Uint8Array;
  arraybuffer: ArrayBuffer;
  blob: Blob;
  stream: NodeJS.ReadableStream;
}

type InputFileFormat = InputByType[keyof InputByType] | Promise<InputByType[keyof InputByType]>;

interface JSZipDefaults {
  base64: boolean; // default false
  binary: boolean; // default false
  dir: boolean; // default false
  createFolders: boolean; // default true
  date: Date; // default null
  compression: Compression | null; // default null
  compressionOptions: CompressionOptions | null; // default null
  comment: string | null; // default null
  unixPermissions: number | string | null; // default null
  dosPermissions: number | null; // default null
}

type JSZipWithDefaults = typeof JSZip & { defaults: JSZipDefaults };

const JSZipX = JSZip as JSZipWithDefaults;

export const createJSZip = () => {
  const currDate = new Date();
  const dateWithOffset = new Date(currDate.getTime() - currDate.getTimezoneOffset() * 60000);
  // replace the default date with dateWithOffset
  JSZipX.defaults.date = dateWithOffset;
  return new JSZipX();
};

export const loadAsyncJSZip = (content: InputFileFormat, options?: JSZip.JSZipLoadOptions): Promise<JSZipFile> => {
  return createJSZip().loadAsync(content, options) as Promise<JSZipFile>;
};

export type JSZipFile = typeof JSZipX;

export type JSZipFileOptions = JSZip.JSZipFileOptions;

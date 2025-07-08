import crypto from "crypto-js";
import { MD5 } from "crypto-js";

export function md5OfText(text: string) {
  return MD5(text).toString();
}

function calculateMD5FromArrayBuffer(a: ArrayBuffer) {
  const wordArray = crypto.lib.WordArray.create(a);
  return MD5(wordArray).toString();
}

export function calculateHashFromArrayBuffer(a: ArrayBuffer) {
  const wordArray = crypto.lib.WordArray.create(<ArrayBuffer>a);
  return({
    md5: crypto.MD5(wordArray).toString(),
    sha1: crypto.SHA1(wordArray).toString(),
    sha256: crypto.SHA256(wordArray).toString(),
    sha384: crypto.SHA384(wordArray).toString(),
    sha512: crypto.SHA512(wordArray).toString(),
  });
}

export function calculateMd5(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.onloadend = () => {
      if (!reader.result) {
        reject(new Error("result is null"));
      } else {
        const result = calculateMD5FromArrayBuffer(<ArrayBuffer>reader.result);
        resolve(result);
      }
    };
  });
}

/*

export function calculateMd5(blob: Blob) {
  const reader = new FileReader();
  reader.readAsBinaryString(blob);
  return new Promise<string>((resolve) => {
    reader.onloadend = () => {
      // @ts-ignore
      const hash = MD5(enc.Latin1.parse(reader.result)).toString();
      resolve(hash);
    };
  });
}

*/

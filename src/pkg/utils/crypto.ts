import crypto from "crypto-js";
import { MD5 } from "crypto-js";

export function calculateMd5(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.onloadend = function () {
      if (!this.result) {
        reject(new Error("result is null"));
      } else {
        const result = calculateMD5FromArrayBuffer(<ArrayBuffer>this.result);
        resolve(result);
      }
    };
  });
}

export function md5OfText(text: string) {
  return MD5(text).toString();
}

function calculateMD5FromArrayBuffer(a: ArrayBuffer) {
  const wordArray = crypto.lib.WordArray.create(a);
  return MD5(wordArray).toString();
}

export function calculateHashFromArrayBuffer(a: ArrayBuffer) {
  const wordArray = crypto.lib.WordArray.create(<ArrayBuffer>a);
  // 计算各种哈希值
  const ret = {
    md5: crypto.MD5(wordArray),
    sha1: crypto.SHA1(wordArray),
    sha256: crypto.SHA256(wordArray),
    sha384: crypto.SHA384(wordArray),
    sha512: crypto.SHA512(wordArray),
  };
  return {
    md5: ret.md5.toString(),
    sha1: ret.sha1.toString(),
    sha256: ret.sha256.toString(),
    sha384: ret.sha384.toString(),
    sha512: ret.sha512.toString(),
    integrity: {
      md5: ret.md5.toString(crypto.enc.Base64),
      sha1: ret.sha1.toString(crypto.enc.Base64),
      sha256: ret.sha256.toString(crypto.enc.Base64),
      sha384: ret.sha384.toString(crypto.enc.Base64),
      sha512: ret.sha512.toString(crypto.enc.Base64),
    },
  };
}

import { describe, it, expect } from "vitest";
import { calculateHashFromArrayBuffer } from "./crypto";

describe.concurrent("crypto utils", () => {
  describe.concurrent("calculateHashFromArrayBuffer", () => {
    it.concurrent("计算hash", () => {
      // 将字符串 "123456" 转换为 ArrayBuffer
      const str = "123456";
      const uint8Array = Uint8Array.from(str, (c) => c.charCodeAt(0));
      const buffer = uint8Array.buffer;
      const result = calculateHashFromArrayBuffer(buffer);
      expect(result).toEqual({
        md5: "e10adc3949ba59abbe56e057f20f883e",
        sha1: "7c4a8d09ca3762af61e59520943dc26494f8941b",
        sha256: "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
        sha384: "0a989ebc4a77b56a6e2bb7b19d995d185ce44090c13e2984b7ecc6d446d4b61ea9991b76a4c2f04b1b4d244841449454",
        sha512:
          "ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548baeae6956df346ec8c17f5ea10f35ee3cbc514797ed7ddd3145464e2a0bab413",
        integrity: {
          md5: "4QrcOUm6Wau+VuBX8g+IPg==",
          sha1: "fEqNCco3Yq9h5ZUglD3CZJT4lBs=",
          sha256: "jZae727K08KaOmKSgOaGzww/XVqGr/PKEgIMkjrcbJI=",
          sha384: "CpievEp3tWpuK7exnZldGFzkQJDBPimEt+zG1EbUth6pmRt2pMLwSxtNJEhBRJRU",
          sha512: "ujJTh2rta8ItSm/1PYQGxq2GQZXtFEq1yHYhtsIztUi66uaVbfNG7IwX9eoQ817jy8UUeX7X3dMUVGTioLq0Ew==",
        },
      });
    });
  });
});

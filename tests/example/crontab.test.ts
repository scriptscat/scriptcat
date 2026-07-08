import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it, vi } from "vitest";

type RequestDetails = {
  url: string;
  onload: (response: { status: number; response: unknown }) => void;
};

const source = readFileSync(resolve(process.cwd(), "example/crontab/crontab.js"), "utf8");
const runExample = new Function("GM_log", "GM_xmlhttpRequest", source) as (
  log: (message: string) => void,
  request: (details: RequestDetails) => void
) => Promise<void>;

describe("定时脚本示例", () => {
  it("定时请求 httpbun 并记录响应 URL", async () => {
    const log = vi.fn();
    let requestDetails: RequestDetails | undefined;
    const result = runExample(log, (details) => {
      requestDetails = details;
    });

    expect(requestDetails?.url).toBe("https://httpbun.com/get");

    requestDetails?.onload({
      status: 200,
      response: {
        url: "https://httpbun.com/get",
      },
    });

    await expect(result).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("定时请求成功：\nhttps://httpbun.com/get");
  });
});

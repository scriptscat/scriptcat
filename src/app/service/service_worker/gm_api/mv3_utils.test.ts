import { describe, expect, it, vi } from "vitest";
import { ChromiumHeaderMarkerLinker, normalizeBackgroundRequestUrl } from "./mv3_utils";

describe("GM XHR request linker", () => {
  it("keep query strings when normalizing Firefox background request URLs", () => {
    expect(normalizeBackgroundRequestUrl("https://test-example.com/api/search")).toBe(
      "https://test-example.com/api/search"
    );
    expect(normalizeBackgroundRequestUrl("https://user:@example.com/api/search")).toBe(
      "https://example.com/api/search"
    );
    expect(normalizeBackgroundRequestUrl("https://user:pass@example.com/api/search")).toBe(
      "https://example.com/api/search"
    );
    expect(normalizeBackgroundRequestUrl("https://example.com/api/search?q=one&a=1")).toBe(
      "https://example.com/api/search?q=one&a=1"
    );
    expect(normalizeBackgroundRequestUrl("https://user:@example.com/api/search?a=2&q=two")).toBe(
      "https://example.com/api/search?a=2&q=two"
    );
    expect(normalizeBackgroundRequestUrl("https://user:pass@example.com/api/search?q=one&a=3")).toBe(
      "https://example.com/api/search?q=one&a=3"
    );
    expect(normalizeBackgroundRequestUrl("https://user:pass@example.com/api/search?a=4&q=two")).toBe(
      "https://example.com/api/search?a=4&q=two"
    );
  });

  it("adds Chromium marker header before the request is sent", () => {
    const linker = new ChromiumHeaderMarkerLinker();
    const headers: Record<string, string> = {};

    linker.prepareRequest({ url: "https://example.com/" } as GMSend.XHRDetails, headers, "MARKER::abc");

    expect(headers["x-sc-request-marker"]).toBe("MARKER::abc");
  });

  it("installs Chromium DNR cleanup rule for the temporary marker header", async () => {
    const linker = new ChromiumHeaderMarkerLinker();

    linker.setup({ cleanupOnAPIError: () => undefined });

    const rules = await chrome.declarativeNetRequest.getSessionRules();
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 999,
          action: expect.objectContaining({
            requestHeaders: [
              {
                header: "x-sc-request-marker",
                operation: "remove",
              },
            ],
          }),
        }),
      ])
    );
  });

  it("delegates Chromium send without extra request matching", () => {
    const linker = new ChromiumHeaderMarkerLinker();
    const xhr = {
      send: vi.fn().mockReturnValue("sent"),
    } as unknown as XMLHttpRequest;

    const result = linker.send(xhr, "body", { markerID: "MARKER::abc", url: "https://example.com/" });

    expect(result).toBe("sent");
    expect(xhr.send).toHaveBeenCalledWith("body");
  });
});

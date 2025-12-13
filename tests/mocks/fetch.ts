import { vi } from "vitest";
import { MockRequest } from "./request";
import { MockBlob } from "./blob";
import { getMockNetworkResponse, MockResponse } from "./response";
import { setNetworkRequestCounter } from "./network";

// --- Mock Fetch ---
export const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof MockRequest ? input : new MockRequest(input, init);

  // Check for abort
  if (request.signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Get mock response
  const { data, contentType, blob } = getMockNetworkResponse(request.url);
  const body = blob ? new MockBlob([data], { type: contentType }) : data;

  const ret = new MockResponse(body, {
    status: 200,
    headers: { "Content-Type": contentType },
    url: request.url,
  });

  if (typeof input === "string") {
    setNetworkRequestCounter(input);
  }

  return ret;
});

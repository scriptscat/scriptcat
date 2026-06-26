import { vi } from "vitest";

export function mockMatchMedia(matches: boolean | ((query: string) => boolean) = false): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: typeof matches === "function" ? matches(query) : matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

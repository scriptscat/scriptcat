import type { ReactElement } from "react";
import { render, type RenderOptions, cleanup } from "@testing-library/react";
import { AppProvider } from "@App/pages/store/AppContext";
import { vi, afterEach } from "vitest";

// Mock monaco-editor
vi.mock("monaco-editor", () => ({
  editor: {
    setTheme: vi.fn(),
    create: vi.fn(),
    createModel: vi.fn(),
    setModelLanguage: vi.fn(),
  },
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// 自定义render函数，包装Redux Provider
const customRender = (
  ui: ReactElement,
  { _initialState = {}, ...renderOptions }: { _initialState?: any; store?: any } & Omit<RenderOptions, "wrapper"> = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return <AppProvider>{children}</AppProvider>;
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// Setup global mocks
export const setupGlobalMocks = () => {
  // Chrome mock已经在vitest.setup.ts中通过chromeMock.init()设置了

  // Mock window.open
  Object.assign(global, {
    open: vi.fn(),
    location: { href: "https://example.com" },
    matchMedia: () => {
      return {
        matches: false,
        addEventListener: vi.fn(),
      };
    },
  });
};

export * from "@testing-library/react";
export { customRender as render };

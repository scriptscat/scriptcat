import type { ReactElement } from "react";
import { render, type RenderOptions, cleanup } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
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

// 创建一个基础的mock store
const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      script: (state = { scripts: [], backScripts: [] }) => state,
      config: (state = { theme: "light" }) => state,
    },
    preloadedState: initialState,
  });
};

// 自定义render函数，包装Redux Provider
const customRender = (
  ui: ReactElement,
  {
    initialState = {},
    store = createMockStore(initialState),
    ...renderOptions
  }: { initialState?: any; store?: any } & Omit<RenderOptions, "wrapper"> = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return <Provider store={store}>{children}</Provider>;
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
  });
};

export * from "@testing-library/react";
export { customRender as render, createMockStore };

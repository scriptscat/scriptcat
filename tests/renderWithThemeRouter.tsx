import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@App/pages/components/theme-provider";

export function renderWithRouter(ui: ReactElement, options: { initialEntries?: string[] } = {}): RenderResult {
  return render(<MemoryRouter initialEntries={options.initialEntries}>{ui}</MemoryRouter>);
}

export function renderWithThemeRouter(ui: ReactElement, options: { initialEntries?: string[] } = {}): RenderResult {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={options.initialEntries}>{ui}</MemoryRouter>
    </ThemeProvider>
  );
}

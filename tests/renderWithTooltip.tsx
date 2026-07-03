import type { PropsWithChildren, ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";

export function renderWithTooltip(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: TooltipProvider });
}

export function renderWithRouterTooltip(ui: ReactElement, options: { initialEntries?: string[] } = {}): RenderResult {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={options.initialEntries}>
      <TooltipProvider>{children}</TooltipProvider>
    </MemoryRouter>
  );
  return render(ui, { wrapper: Wrapper });
}

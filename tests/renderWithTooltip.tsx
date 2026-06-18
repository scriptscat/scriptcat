import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@App/pages/components/ui/tooltip";

export function renderWithTooltip(ui: ReactElement): RenderResult {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

export function renderWithRouterTooltip(ui: ReactElement, options: { initialEntries?: string[] } = {}): RenderResult {
  return render(
    <MemoryRouter initialEntries={options.initialEntries}>
      <TooltipProvider>{ui}</TooltipProvider>
    </MemoryRouter>
  );
}

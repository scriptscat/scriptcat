import type { LucideIcon } from "lucide-react";
import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@App/pages/components/ui/dropdown-menu";
import { cn } from "@App/pkg/utils/cn";

export interface AgentCardMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  onSelect: () => void;
}

// 卡片右上角 kebab 菜单：常驻 ⋮ 触发器 + 下拉项（danger 项标红）
export function AgentCardMenu({ items }: { items: AgentCardMenuItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="card-menu"
          aria-label="More options"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <MoreVertical className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.key}
              data-testid={`card-menu-${item.key}`}
              onSelect={item.onSelect}
              className={cn(item.danger && "text-destructive focus:text-destructive")}
            >
              {Icon && <Icon className="size-4" />}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import type React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "./button";

type PaginationProps = React.ComponentProps<"nav"> & {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
};

/** 当前页两侧各保留一个页码，首尾页恒常可见，其余折叠为省略号。 */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  return visible.flatMap((value, index) =>
    index > 0 && value - visible[index - 1] > 1 ? ["gap" as const, value] : [value]
  );
}

function Pagination({ page, pageCount, onPageChange, previousLabel, nextLabel, className, ...props }: PaginationProps) {
  return (
    <nav data-slot="pagination" className={cn("flex items-center gap-1", className)} {...props}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={previousLabel}
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      {pageItems(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} data-slot="pagination-ellipsis" className="px-1 text-xs text-muted-foreground">
            {"…"}
          </span>
        ) : (
          <Button
            key={item}
            data-slot="pagination-item"
            variant={item === page ? "secondary" : "ghost"}
            size="icon-sm"
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        )
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={nextLabel}
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </nav>
  );
}

export { Pagination };

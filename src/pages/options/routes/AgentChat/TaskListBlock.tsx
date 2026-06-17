import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";

function TaskStatusIcon({ status }: { status: Task["status"] }) {
  switch (status) {
    case "completed":
      return (
        <span className="size-[18px] rounded-full bg-green-600 flex items-center justify-center shrink-0">
          <Check className="size-2.5 text-white" />
        </span>
      );
    case "in_progress":
      return (
        <span className="size-[18px] rounded-full border-2 border-primary flex items-center justify-center shrink-0">
          <Loader2 className="size-2.5 text-primary animate-spin" />
        </span>
      );
    default:
      return <span className="size-[18px] rounded-full border-2 border-border bg-transparent shrink-0" />;
  }
}

/** 环形进度指示器 */
function ProgressRing({ progress, allDone }: { progress: number; allDone: boolean }) {
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-muted" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        className={allDone ? "stroke-green-600" : "stroke-primary"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.5s ease-out" }}
      />
    </svg>
  );
}

export default function TaskListBlock({ tasks }: { tasks: Task[] }) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const completed = tasks.filter((task) => task.status === "completed").length;
  const total = tasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const allDone = completed === total;

  return (
    <div className="my-3 rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        type="button"
        data-testid="task-toggle"
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-accent transition-colors text-left bg-transparent border-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <ProgressRing progress={progress} allDone={allDone} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-foreground leading-tight">{t("agent:tasks")}</span>
            <span data-testid="task-progress" className="text-xs text-muted-foreground leading-tight mt-0.5">
              {completed}/{total}
            </span>
          </div>
        </div>
        <ChevronDown
          className={cn("size-3 text-muted-foreground transition-transform shrink-0", collapsed && "-rotate-90")}
        />
      </button>

      {!collapsed && (
        <div>
          <div className="border-t border-border" />
          <div className="px-4 py-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                data-testid={`task-${task.id}`}
                data-status={task.status}
                className="flex items-center gap-2.5 py-[7px]"
              >
                <TaskStatusIcon status={task.status} />
                <span
                  className={cn(
                    "text-[13px] leading-normal transition-colors",
                    task.status === "completed"
                      ? "text-muted-foreground line-through"
                      : task.status === "in_progress"
                        ? "text-foreground font-medium"
                        : "text-foreground/80"
                  )}
                >
                  {task.subject}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-[3px] bg-muted">
        <div
          className={cn(
            "h-full rounded-r-full transition-all duration-500 ease-out",
            allDone ? "bg-green-600" : "bg-primary"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

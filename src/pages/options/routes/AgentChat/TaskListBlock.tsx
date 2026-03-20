import { IconCheck, IconLoading, IconClockCircle } from "@arco-design/web-react/icon";
import type { Task } from "@App/app/service/agent/tools/task_tools";

function TaskStatusIcon({ status }: { status: Task["status"] }) {
  switch (status) {
    case "completed":
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-bg-[rgb(var(--green-1))] tw-flex tw-items-center tw-justify-center tw-shrink-0">
          <IconCheck style={{ fontSize: 10, color: "rgb(var(--green-6))" }} />
        </span>
      );
    case "in_progress":
      return (
        <span className="tw-w-4 tw-h-4 tw-flex tw-items-center tw-justify-center tw-shrink-0">
          <IconLoading style={{ fontSize: 12, color: "rgb(var(--arcoblue-6))" }} />
        </span>
      );
    default:
      return (
        <span className="tw-w-4 tw-h-4 tw-rounded-full tw-border tw-border-solid tw-border-[var(--color-border-2)] tw-bg-transparent tw-shrink-0" />
      );
  }
}

export default function TaskListBlock({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === "completed").length;
  const total = tasks.length;

  return (
    <div className="tw-my-3 tw-rounded-lg tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-bg-[var(--color-fill-1)] tw-overflow-hidden">
      {/* 标题栏 */}
      <div className="tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-border-b tw-border-solid tw-border-[var(--color-border-1)]">
        <div className="tw-flex tw-items-center tw-gap-1.5">
          <IconClockCircle style={{ fontSize: 12 }} className="tw-text-[var(--color-text-3)]" />
          <span className="tw-text-xs tw-font-medium tw-text-[var(--color-text-2)]">Tasks</span>
        </div>
        <span className="tw-text-xs tw-text-[var(--color-text-3)]">
          {completed}/{total}
        </span>
      </div>

      {/* 进度条 */}
      <div className="tw-h-0.5 tw-bg-[var(--color-fill-3)]">
        <div
          className="tw-h-full tw-bg-[rgb(var(--green-6))] tw-transition-all tw-duration-300"
          style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
        />
      </div>

      {/* 任务列表 */}
      <div className="tw-px-3 tw-py-1.5">
        {tasks.map((task) => (
          <div key={task.id} className="tw-flex tw-items-start tw-gap-2 tw-py-1.5">
            <div className="tw-mt-0.5">
              <TaskStatusIcon status={task.status} />
            </div>
            <span
              className={`tw-text-xs tw-leading-relaxed ${
                task.status === "completed"
                  ? "tw-text-[var(--color-text-4)] tw-line-through"
                  : "tw-text-[var(--color-text-1)]"
              }`}
            >
              {task.subject}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { IconCheck, IconLoading, IconDown } from "@arco-design/web-react/icon";
import type { Task } from "@App/app/service/agent/core/tools/task_tools";

function TaskStatusIcon({ status }: { status: Task["status"] }) {
  switch (status) {
    case "completed":
      return (
        <span className="tw-w-[18px] tw-h-[18px] tw-rounded-full tw-bg-[rgb(var(--green-6))] tw-flex tw-items-center tw-justify-center tw-shrink-0">
          <IconCheck style={{ fontSize: 10, color: "#fff" }} />
        </span>
      );
    case "in_progress":
      return (
        <span
          className="tw-w-[18px] tw-h-[18px] tw-rounded-full tw-border-2 tw-border-solid tw-flex tw-items-center tw-justify-center tw-shrink-0"
          style={{ borderColor: "rgb(var(--arcoblue-6))" }}
        >
          <IconLoading style={{ fontSize: 10, color: "rgb(var(--arcoblue-6))" }} />
        </span>
      );
    default:
      return (
        <span className="tw-w-[18px] tw-h-[18px] tw-rounded-full tw-border-2 tw-border-solid tw-border-[var(--color-border-2)] tw-bg-transparent tw-shrink-0" />
      );
  }
}

export default function TaskListBlock({ tasks }: { tasks: Task[] }) {
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const total = tasks.length;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const allDone = completed === total;

  return (
    <div className="tw-my-3 tw-rounded-xl tw-border tw-border-solid tw-border-[var(--color-border-1)] tw-bg-[var(--color-bg-2)] tw-overflow-hidden tw-shadow-sm">
      {/* 可点击的标题栏 */}
      <div
        className="tw-flex tw-items-center tw-gap-3 tw-px-4 tw-py-3 tw-cursor-pointer tw-select-none hover:tw-bg-[var(--color-fill-2)] tw-transition-colors tw-duration-150"
        onClick={() => setCollapsed((c) => !c)}
      >
        {/* 左侧：环形进度指示 + 文字 */}
        <div className="tw-flex tw-items-center tw-gap-2.5 tw-flex-1 tw-min-w-0">
          <ProgressRing progress={progress} allDone={allDone} />
          <div className="tw-flex tw-flex-col tw-min-w-0">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-1)] tw-leading-tight">Tasks</span>
            <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-leading-tight tw-mt-0.5">
              {allDone
                ? `${total} 项任务已完成`
                : inProgress > 0
                  ? `正在执行 ${inProgress} 项，${completed}/${total} 已完成`
                  : `${completed}/${total} 已完成`}
            </span>
          </div>
        </div>

        {/* 右侧：展开/收起箭头 */}
        <IconDown
          className="tw-text-[var(--color-text-3)] tw-transition-transform tw-duration-200 tw-shrink-0"
          style={{
            fontSize: 12,
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        />
      </div>

      {/* 可收缩的任务列表 */}
      <div
        className="tw-transition-all tw-duration-200 tw-ease-in-out tw-overflow-hidden"
        style={{
          maxHeight: collapsed ? 0 : `${tasks.length * 40 + 16}px`,
          opacity: collapsed ? 0 : 1,
        }}
      >
        <div className="tw-border-t tw-border-solid tw-border-[var(--color-border-1)]" />
        <div className="tw-px-4 tw-py-2">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="tw-flex tw-items-center tw-gap-2.5 tw-py-[7px]"
              style={{
                // 逐项淡入动画
                animation: "taskFadeIn 0.15s ease-out both",
                animationDelay: `${index * 30}ms`,
              }}
            >
              <TaskStatusIcon status={task.status} />
              <span
                className={`tw-text-[13px] tw-leading-normal tw-transition-colors tw-duration-200 ${
                  task.status === "completed"
                    ? "tw-text-[var(--color-text-4)] tw-line-through"
                    : task.status === "in_progress"
                      ? "tw-text-[var(--color-text-1)] tw-font-medium"
                      : "tw-text-[var(--color-text-2)]"
                }`}
              >
                {task.subject}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 底部进度条 */}
      <div className="tw-h-[3px] tw-bg-[var(--color-fill-2)]">
        <div
          className="tw-h-full tw-transition-all tw-duration-500 tw-ease-out tw-rounded-r-full"
          style={{
            width: `${progress}%`,
            background: allDone
              ? "rgb(var(--green-6))"
              : "linear-gradient(90deg, rgb(var(--arcoblue-5)), rgb(var(--arcoblue-6)))",
          }}
        />
      </div>
    </div>
  );
}

/** 环形进度指示器 */
function ProgressRing({ progress, allDone }: { progress: number; allDone: boolean }) {
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="tw-shrink-0" style={{ transform: "rotate(-90deg)" }}>
      {/* 背景圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-fill-3)"
        strokeWidth={strokeWidth}
      />
      {/* 进度圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={allDone ? "rgb(var(--green-6))" : "rgb(var(--arcoblue-6))"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="tw-transition-all tw-duration-500 tw-ease-out"
      />
    </svg>
  );
}

import {
  Badge,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Message,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "@arco-design/web-react";
import { IconDelete, IconEdit, IconHistory, IconPlayArrow, IconPlus } from "@arco-design/web-react/icon";
import AgentDocLink from "./AgentDocLink";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type {
  AgentTask,
  AgentTaskRun,
  AgentModelConfig,
  InternalAgentTask,
  EventAgentTask,
} from "@App/app/service/agent/core/types";
import { AgentTaskRepo, AgentTaskRunRepo } from "@App/app/repo/agent_task";
import { uuidv4 } from "@App/pkg/utils/uuid";
import { nextTimeDisplay } from "@App/pkg/utils/cron";
import { agentClient } from "@App/pages/store/features/script";

const taskRepo = new AgentTaskRepo();
const taskRunRepo = new AgentTaskRunRepo();

/** 编辑状态中的任务类型：去掉系统自动填充的字段 */
type EditingTask =
  | Omit<InternalAgentTask, "id" | "createtime" | "updatetime" | "nextruntime">
  | Omit<EventAgentTask, "id" | "createtime" | "updatetime" | "nextruntime">;

const emptyTask: EditingTask = {
  name: "",
  crontab: "",
  mode: "internal",
  enabled: true,
  notify: true,
  prompt: "",
  maxIterations: 10,
};

function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggle,
  onRunNow,
  onHistory,
}: {
  task: AgentTask;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
  onRunNow: () => void;
  onHistory: () => void;
}) {
  const { t } = useTranslation();

  let nextRunText = "";
  try {
    nextRunText = task.enabled && task.crontab ? nextTimeDisplay(task.crontab) : "-";
  } catch {
    nextRunText = "-";
  }

  return (
    <div
      className={`tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default ${
        task.enabled
          ? "tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
          : "tw-bg-[var(--color-bg-3)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.03)] tw-opacity-60"
      }`}
    >
      {/* 顶部区域 */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-4">
        <div className="tw-flex tw-items-center tw-gap-3">
          <div
            className={`tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-lg tw-font-bold tw-shrink-0 ${
              task.mode === "internal" ? "tw-bg-[#e3f2fd] tw-text-[#1565c0]" : "tw-bg-[#e8f5e9] tw-text-[#2e7d32]"
            }`}
          >
            {task.mode === "internal" ? "I" : "E"}
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{task.name}</Typography.Text>
            <div className="tw-flex tw-items-center tw-gap-2">
              <Tag size="small" color={task.mode === "internal" ? "blue" : "green"}>
                {t(task.mode === "internal" ? "agent_tasks_mode_internal" : "agent_tasks_mode_event")}
              </Tag>
              <Typography.Text type="secondary" className="tw-text-xs tw-font-mono !tw-mb-0">
                {task.crontab}
              </Typography.Text>
            </div>
          </div>
        </div>
        <Switch size="small" checked={task.enabled} onChange={onToggle} />
      </div>

      {/* 信息区域 */}
      <div className="tw-flex tw-flex-col tw-gap-2 tw-mb-4">
        <div className="tw-flex tw-items-center tw-gap-2">
          <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">{t("agent_tasks_next_run")}</span>
          <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
            {nextRunText}
          </Typography.Text>
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
          <span className="tw-text-xs tw-text-[var(--color-text-3)] tw-min-w-16">{t("agent_tasks_last_status")}</span>
          {task.lastRunStatus ? (
            <Badge
              status={task.lastRunStatus === "success" ? "success" : "error"}
              text={t(
                task.lastRunStatus === "success" ? "agent_tasks_run_status_success" : "agent_tasks_run_status_error"
              )}
            />
          ) : (
            <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
              {t("agent_tasks_never_run")}
            </Typography.Text>
          )}
        </div>
      </div>

      {/* 操作栏 */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconPlayArrow />} onClick={onRunNow}>
          {t("agent_tasks_run_now")}
        </Button>
        <Button type="text" size="small" icon={<IconHistory />} onClick={onHistory}>
          {t("agent_tasks_history")}
        </Button>
        <Button type="text" size="small" icon={<IconEdit />} onClick={onEdit}>
          {t("agent_model_edit")}
        </Button>
        <Popconfirm title={t("agent_tasks_delete_confirm")} onOk={onDelete}>
          <Button type="text" size="small" status="danger" icon={<IconDelete />}>
            {t("agent_model_delete")}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

function RunHistoryDrawer({
  task,
  visible,
  onClose,
}: {
  task: AgentTask | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<AgentTaskRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !task) return;
    setLoading(true);
    taskRunRepo
      .listRuns(task.id)
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [visible, task]);

  const handleClear = async () => {
    if (!task) return;
    await taskRunRepo.clearRuns(task.id);
    setRuns([]);
    Message.success(t("clear_success"));
  };

  const columns = [
    {
      title: t("agent_tasks_run_time"),
      dataIndex: "starttime",
      width: 170,
      render: (val: number) => new Date(val).toLocaleString(),
    },
    {
      title: t("agent_tasks_run_status"),
      dataIndex: "status",
      width: 100,
      render: (status: string) => (
        <Badge
          status={status === "success" ? "success" : status === "error" ? "error" : "processing"}
          text={t(`agent_tasks_run_status_${status}`)}
        />
      ),
    },
    {
      title: t("agent_tasks_run_duration"),
      dataIndex: "endtime",
      width: 100,
      render: (endtime: number | undefined, record: AgentTaskRun) =>
        endtime ? `${((endtime - record.starttime) / 1000).toFixed(1)}s` : "-",
    },
    {
      title: t("agent_tasks_run_usage"),
      dataIndex: "usage",
      width: 120,
      render: (usage: AgentTaskRun["usage"]) => (usage ? `${usage.inputTokens} / ${usage.outputTokens}` : "-"),
    },
  ];

  return (
    <Drawer
      width={600}
      title={task?.name || ""}
      visible={visible}
      onCancel={onClose}
      footer={
        <Popconfirm title={t("agent_tasks_clear_runs_confirm")} onOk={handleClear}>
          <Button status="danger" size="small">
            {t("agent_tasks_clear_runs")}
          </Button>
        </Popconfirm>
      }
      unmountOnExit
    >
      <Table
        columns={columns}
        data={runs}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
        noDataElement={<Empty description={t("no_data")} />}
      />
    </Drawer>
  );
}

function AgentTasks() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<EditingTask>({
    ...emptyTask,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cronPreview, setCronPreview] = useState("");
  const [drawerTask, setDrawerTask] = useState<AgentTask | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadData = useCallback(async () => {
    const [taskList, modelList] = await Promise.all([taskRepo.listTasks(), agentClient.listModels()]);
    setTasks(taskList);
    setModels(modelList);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 实时预览 cron 下次运行时间
  useEffect(() => {
    if (!editingTask.crontab) {
      setCronPreview("");
      return;
    }
    try {
      setCronPreview(nextTimeDisplay(editingTask.crontab));
    } catch {
      setCronPreview(t("cron_invalid_expr"));
    }
  }, [editingTask.crontab, t]);

  const handleAdd = () => {
    setEditingTask({ ...emptyTask });
    setEditingId(null);
    setModalVisible(true);
  };

  const handleEdit = (task: AgentTask) => {
    const { id: _id, createtime: _ct, updatetime: _ut, nextruntime: _nt, ...rest } = task;
    setEditingTask(rest);
    setEditingId(task.id);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    await taskRepo.removeTask(id);
    loadData();
  };

  const handleToggle = async (task: AgentTask, enabled: boolean) => {
    const updated = { ...task, enabled, updatetime: Date.now() };
    if (enabled) {
      try {
        const info = nextTimeDisplay(task.crontab);
        void info; // just validate
      } catch {
        // ignore
      }
    }
    await taskRepo.saveTask(updated);
    loadData();
  };

  const handleRunNow = async (task: AgentTask) => {
    try {
      // 通过 sendMessage 调用 SW
      await chrome.runtime.sendMessage({
        channel: "agent",
        action: "agentTask",
        data: { action: "runNow", id: task.id },
      });
      Message.success(t("agent_tasks_run_now"));
    } catch {
      // 直接通过 repo 标记（fallback：调度器会在下次 tick 执行）
      Message.info(t("agent_tasks_run_now"));
    }
  };

  const handleHistory = (task: AgentTask) => {
    setDrawerTask(task);
    setDrawerVisible(true);
  };

  const handleModalOk = async () => {
    if (!editingTask.name || !editingTask.crontab) {
      Message.error(t("agent_tasks_name_cron_required"));
      return;
    }

    // 验证 cron 表达式
    try {
      nextTimeDisplay(editingTask.crontab);
    } catch {
      Message.error(t("cron_invalid_expr"));
      return;
    }

    const now = Date.now();

    if (editingId) {
      const existing = tasks.find((t) => t.id === editingId);
      if (existing) {
        const updated: AgentTask = { ...existing, ...editingTask, updatetime: now };
        if (updated.enabled) {
          try {
            const info = nextTimeDisplay(updated.crontab);
            void info;
          } catch {
            // ignore
          }
        }
        await taskRepo.saveTask(updated);
      }
    } else {
      const task: AgentTask = {
        ...editingTask,
        id: uuidv4(),
        createtime: now,
        updatetime: now,
      };
      if (task.enabled) {
        try {
          // nextruntime will be computed by scheduler init
        } catch {
          // ignore
        }
      }
      await taskRepo.saveTask(task);
    }

    setModalVisible(false);
    loadData();
  };

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card
        title={t("agent_tasks_title")}
        bordered={false}
        extra={
          <Space>
            <Button type="primary" icon={<IconPlus />} onClick={handleAdd}>
              {t("agent_tasks_create")}
            </Button>
            <AgentDocLink page="tasks" />
          </Space>
        }
      >
        {tasks.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_tasks_no_tasks")} />
          </div>
        ) : (
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => handleEdit(task)}
                onDelete={() => handleDelete(task.id)}
                onToggle={(enabled) => handleToggle(task, enabled)}
                onRunNow={() => handleRunNow(task)}
                onHistory={() => handleHistory(task)}
              />
            ))}
          </div>
        )}
      </Card>

      <Modal
        title={editingId ? t("agent_tasks_edit") : t("agent_tasks_create")}
        visible={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        autoFocus={false}
        focusLock
        unmountOnExit
        style={{ maxWidth: 520 }}
      >
        <Space direction="vertical" size={16} className="tw-w-full">
          {/* 名称 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_model_name")}
            </div>
            <Input
              value={editingTask.name}
              placeholder="Daily Summary"
              onChange={(value) => setEditingTask((prev) => ({ ...prev, name: value }))}
            />
          </div>

          {/* 模式 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">{t("type")}</div>
            <Radio.Group
              value={editingTask.mode}
              onChange={(value) => setEditingTask((prev) => ({ ...prev, mode: value }))}
            >
              <Radio value="internal">{t("agent_tasks_mode_internal")}</Radio>
              <Radio value="event">{t("agent_tasks_mode_event")}</Radio>
            </Radio.Group>
          </div>

          {/* Cron 表达式 */}
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_tasks_cron")}
            </div>
            <Input
              value={editingTask.crontab}
              placeholder="0 9 * * *"
              onChange={(value) => setEditingTask((prev) => ({ ...prev, crontab: value }))}
            />
            {cronPreview && (
              <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0 tw-mt-1 tw-block">
                {t("agent_tasks_next_run")}
                {": "}
                {cronPreview}
              </Typography.Text>
            )}
          </div>

          {/* internal 模式字段 */}
          {editingTask.mode === "internal" && (
            <>
              {/* 提示词 */}
              <div>
                <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
                  {t("agent_tasks_prompt")}
                </div>
                <Input.TextArea
                  value={editingTask.prompt}
                  placeholder="请生成今日摘要报告"
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  onChange={(value) => setEditingTask((prev) => ({ ...prev, prompt: value }))}
                />
              </div>

              {/* 模型选择 */}
              <div>
                <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
                  {t("agent_tasks_model_select")}
                </div>
                <Select
                  value={editingTask.modelId || undefined}
                  placeholder={t("agent_tasks_model_select")}
                  allowClear
                  onChange={(value) => setEditingTask((prev) => ({ ...prev, modelId: value }))}
                >
                  {models.map((m) => (
                    <Select.Option key={m.id} value={m.id}>
                      {m.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* 最大迭代次数 */}
              <div>
                <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
                  {t("agent_tasks_max_iterations")}
                </div>
                <InputNumber
                  value={editingTask.maxIterations}
                  min={1}
                  max={100}
                  onChange={(value) => setEditingTask((prev) => ({ ...prev, maxIterations: value }))}
                />
              </div>

              {/* 续接对话 ID */}
              <div>
                <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
                  {t("agent_tasks_conversation_id")}
                </div>
                <Input
                  value={editingTask.conversationId || ""}
                  placeholder=""
                  allowClear
                  onChange={(value) => setEditingTask((prev) => ({ ...prev, conversationId: value || undefined }))}
                />
              </div>
            </>
          )}

          {/* event 模式提示 */}
          {editingTask.mode === "event" && (
            <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
              {t("agent_tasks_event_hint")}
            </Typography.Text>
          )}

          {/* 通知开关 */}
          <div className="tw-flex tw-items-center tw-gap-3">
            <span className="tw-text-sm tw-font-medium tw-text-[var(--color-text-2)]">{t("agent_tasks_notify")}</span>
            <Switch
              checked={editingTask.notify}
              onChange={(checked) => setEditingTask((prev) => ({ ...prev, notify: checked }))}
            />
          </div>
        </Space>
      </Modal>

      <RunHistoryDrawer task={drawerTask} visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </Space>
  );
}

export default AgentTasks;

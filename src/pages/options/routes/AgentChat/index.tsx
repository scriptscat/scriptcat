import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronLeft, Download, PanelLeftClose, PanelLeftOpen, Sparkles, SquarePen } from "lucide-react";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { agentClient } from "@App/pages/store/features/script";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { cn } from "@App/pkg/utils/cn";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import { useConversations, useSkills, useRunningConversations } from "./hooks";
import { exportToMarkdown, downloadMarkdown } from "./export_utils";

// 当前模型胶囊：sparkles 图标 + 模型名，呈现在标题下方
function ModelPill({ name }: { name: string }) {
  if (!name) return null;
  return (
    <span
      data-testid="chat-model-pill"
      className="inline-flex items-center gap-1.5 rounded-full bg-input/60 px-2 py-0.5 leading-none"
    >
      <Sparkles className="size-3 text-primary shrink-0" />
      <span className="text-[11px] font-medium text-fg-secondary truncate max-w-[180px]">{name}</span>
    </span>
  );
}

const headerActionBtn =
  "size-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";

// 头部操作组：导出当前会话、新建会话
function HeaderActions({ onExport, onNew }: { onExport?: () => void; onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {onExport && (
        <button
          type="button"
          data-testid="header-export"
          aria-label={t("agent:chat_export")}
          title={t("agent:chat_export")}
          onClick={onExport}
          className={headerActionBtn}
        >
          <Download className="size-[18px]" />
        </button>
      )}
      <button
        type="button"
        data-testid="header-new"
        aria-label={t("agent:chat_new")}
        title={t("agent:chat_new")}
        onClick={onNew}
        className={headerActionBtn}
      >
        <SquarePen className="size-[18px]" />
      </button>
    </div>
  );
}

export default function AgentChat() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // 移动端在「列表」与「对话」两屏之间切换（窄屏放不下桌面三栏并排）
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");

  useEffect(() => {
    Promise.all([agentClient.listModels(), agentClient.getDefaultModelId()]).then(([modelList, defId]) => {
      setModels(modelList);
      setDefaultModelId(defId || modelList[0]?.id || "");
      setModelsLoaded(true);
    });
  }, []);

  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
    renameConversation,
    loadConversations,
  } = useConversations();

  const { skills } = useSkills();

  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedSkills, setSelectedSkills] = useState<"auto" | string[]>("auto");
  const [enableTools, setEnableTools] = useState<boolean>(true);
  const [backgroundEnabled, setBackgroundEnabled] = useState<boolean>(false);
  const { runningIds } = useRunningConversations();

  // 切换会话时，自动恢复该会话上次使用的模型
  useEffect(() => {
    if (!activeId) {
      setSelectedModelId("");
      return;
    }
    const conv = conversations.find((c) => c.id === activeId);
    if (conv?.modelId) {
      setSelectedModelId(conv.modelId);
    }
  }, [activeId, conversations]);

  const effectiveModelId = selectedModelId || defaultModelId;
  const activeConv = conversations.find((c) => c.id === activeId);
  const activeModelName = models.find((m) => m.id === effectiveModelId)?.name || "";
  const hasActiveConv = !!activeConv;

  // 选中会话：移动端同时切到「对话」屏
  const openConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      setMobileView("chat");
    },
    [setActiveId]
  );

  const handleCreate = useCallback(async () => {
    const { conv } = await createConversation(defaultModelId, selectedSkills);
    setActiveId(conv.id);
    setMobileView("chat");
  }, [createConversation, defaultModelId, selectedSkills, setActiveId]);

  const handleTitleChange = useCallback(() => {
    loadConversations();
  }, [loadConversations]);

  // 导出会话为 Markdown
  const handleExport = useCallback(
    async (id: string) => {
      const conv = conversations.find((c) => c.id === id);
      if (!conv) return;
      const msgs = await agentChatRepo.getMessages(id);
      if (msgs.length === 0) {
        toast.warning(t("agent:chat_no_conversations"));
        return;
      }
      const md = exportToMarkdown(conv, msgs);
      const safeName = conv.title.replace(/[/\\?%*:|"<>]/g, "_");
      downloadMarkdown(`${safeName}.md`, md);
    },
    [conversations, t]
  );

  // 桌面端面板头带折叠按钮；移动端列表屏无折叠(全局抽屉导航)。
  const renderConversationList = (collapsible: boolean) => (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={openConversation}
      onCreate={handleCreate}
      onDelete={deleteConversation}
      onRename={renameConversation}
      onExport={handleExport}
      onCollapse={collapsible ? () => setCollapsed(true) : undefined}
      runningIds={runningIds}
    />
  );

  const chatArea = (
    <ChatArea
      conversationId={activeId}
      models={models}
      modelsLoaded={modelsLoaded}
      selectedModelId={effectiveModelId}
      onModelChange={setSelectedModelId}
      onConversationTitleChange={handleTitleChange}
      skills={skills}
      selectedSkills={selectedSkills}
      onSkillsChange={setSelectedSkills}
      enableTools={enableTools}
      onEnableToolsChange={setEnableTools}
      runningIds={runningIds}
      backgroundEnabled={backgroundEnabled}
      onBackgroundEnabledChange={setBackgroundEnabled}
    />
  );

  // 移动端：列表 / 对话 两屏切换。
  // 全局 MobileHeader(汉堡+抽屉) 已由 App 外壳常驻；本页对话屏只补一条「返回+标题+模型胶囊+操作」的上下文栏，
  // 列表屏不再叠加第二条标题栏(避免双头部)，由 ConversationList 自带的面板头承担新建/搜索。
  if (isMobile) {
    if (mobileView === "chat") {
      return (
        <div className="flex flex-col h-full bg-background">
          <header className="h-12 shrink-0 border-b border-border flex items-center gap-1.5 px-2 bg-card">
            <button
              type="button"
              data-testid="mobile-back"
              aria-label={t("agent:chat")}
              onClick={() => setMobileView("list")}
              className="size-9 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="flex flex-col min-w-0 flex-1 gap-px">
              <span className="text-sm font-semibold text-foreground truncate leading-tight">
                {activeConv?.title || t("agent:chat")}
              </span>
              <ModelPill name={activeModelName} />
            </div>
            <HeaderActions onExport={hasActiveConv ? () => handleExport(activeId) : undefined} onNew={handleCreate} />
          </header>
          {chatArea}
        </div>
      );
    }
    return <div className="h-full bg-background">{renderConversationList(false)}</div>;
  }

  return (
    <div className="flex h-full bg-background">
      {/* 会话列表（可折叠） */}
      <div
        className={cn(
          "shrink-0 border-r border-border overflow-hidden transition-[width] duration-200",
          collapsed ? "w-0" : "w-[280px]"
        )}
      >
        {!collapsed && renderConversationList(true)}
      </div>

      {/* 聊天列 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 头部：折叠钮 + (标题/模型胶囊) + 操作组(导出/新建) */}
        <header className="h-14 shrink-0 border-b border-border flex items-center justify-between gap-2 px-3 bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              data-testid="sidebar-collapse"
              aria-label={t("agent:chat")}
              onClick={() => setCollapsed((c) => !c)}
              className="size-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
            <div className="flex flex-col min-w-0 gap-px">
              <span className="text-[15px] font-semibold text-foreground truncate leading-tight">
                {activeConv?.title || t("agent:chat")}
              </span>
              {hasActiveConv && <ModelPill name={activeModelName} />}
            </div>
          </div>
          {hasActiveConv && <HeaderActions onExport={() => handleExport(activeId)} onNew={handleCreate} />}
        </header>

        {chatArea}
      </div>
    </div>
  );
}

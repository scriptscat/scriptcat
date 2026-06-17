import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { AgentModelConfig } from "@App/app/service/agent/core/types";
import { agentChatRepo } from "@App/app/repo/agent_chat";
import { agentClient } from "@App/pages/store/features/script";
import { useIsMobile } from "@App/pages/components/use-is-mobile";
import { t } from "@App/locales/locales";
import { cn } from "@App/pkg/utils/cn";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import { useConversations, useSkills, useRunningConversations } from "./hooks";
import { exportToMarkdown, downloadMarkdown } from "./export_utils";

export default function AgentChat() {
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
    [conversations]
  );

  const conversationList = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={openConversation}
      onCreate={handleCreate}
      onDelete={deleteConversation}
      onRename={renameConversation}
      onExport={handleExport}
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

  // 移动端：列表 / 对话 两屏切换（全局导航由 App 外壳的 BottomTabBar 承担）
  if (isMobile) {
    if (mobileView === "chat") {
      return (
        <div className="flex flex-col h-full bg-background">
          <header className="h-14 shrink-0 border-b border-border flex items-center gap-2 px-3 bg-card">
            <button
              type="button"
              data-testid="mobile-back"
              aria-label={t("agent:chat")}
              onClick={() => setMobileView("list")}
              className="size-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="text-sm font-medium text-foreground truncate min-w-0">
              {activeConv?.title || t("agent:chat")}
            </span>
          </header>
          {chatArea}
        </div>
      );
    }
    return <div className="h-full bg-background">{conversationList}</div>;
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
        {!collapsed && conversationList}
      </div>

      {/* 聊天列 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 头部 */}
        <header className="h-14 shrink-0 border-b border-border flex items-center gap-2 px-3 bg-card">
          <button
            type="button"
            data-testid="sidebar-collapse"
            aria-label={t("agent:chat")}
            onClick={() => setCollapsed((c) => !c)}
            className="size-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <span className="text-sm font-medium text-foreground truncate min-w-0">
            {activeConv?.title || t("agent:chat")}
          </span>
        </header>

        {chatArea}
      </div>
    </div>
  );
}

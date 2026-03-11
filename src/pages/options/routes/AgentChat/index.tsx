import { useCallback, useState } from "react";
import { useSystemConfig } from "../utils";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import { useConversations } from "./hooks";

export default function AgentChat() {
  const [agentConfig] = useSystemConfig("agent_config");

  const models = agentConfig?.models || [];
  const defaultModelId = agentConfig?.defaultModelId || models[0]?.id || "";

  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
    renameConversation,
    loadConversations,
  } = useConversations();

  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // 使用默认模型 ID（如果未选择）
  const effectiveModelId = selectedModelId || defaultModelId;

  const handleCreate = useCallback(async () => {
    const { conv } = await createConversation(effectiveModelId);
    setActiveId(conv.id);
  }, [createConversation, effectiveModelId, setActiveId]);

  // 当会话标题变更时重新加载会话列表
  const handleTitleChange = useCallback(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <div className="tw-flex tw-h-full tw-bg-[var(--color-bg-1)]">
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onDelete={deleteConversation}
        onRename={renameConversation}
      />
      <ChatArea
        conversationId={activeId}
        models={models}
        selectedModelId={effectiveModelId}
        onModelChange={setSelectedModelId}
        onConversationTitleChange={handleTitleChange}
      />
    </div>
  );
}

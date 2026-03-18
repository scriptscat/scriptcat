import { useCallback, useEffect, useState } from "react";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import { useConversations, useSkills } from "./hooks";
import type { AgentModelConfig } from "@App/app/service/agent/types";
import { agentClient } from "@App/pages/store/features/script";
import "./styles.css";

export default function AgentChat() {
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);

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
  // 当前选择的 skills 配置（用于创建新对话）
  const [selectedSkills, setSelectedSkills] = useState<"auto" | string[]>("auto");
  // 是否携带 tools（默认 true）
  const [enableTools, setEnableTools] = useState<boolean>(true);

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

  // 使用默认模型 ID（如果未选择）
  const effectiveModelId = selectedModelId || defaultModelId;

  const handleCreate = useCallback(async () => {
    const { conv } = await createConversation(effectiveModelId, selectedSkills);
    setActiveId(conv.id);
  }, [createConversation, effectiveModelId, selectedSkills, setActiveId]);

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
        modelsLoaded={modelsLoaded}
        selectedModelId={effectiveModelId}
        onModelChange={setSelectedModelId}
        onConversationTitleChange={handleTitleChange}
        skills={skills}
        selectedSkills={selectedSkills}
        onSkillsChange={setSelectedSkills}
        enableTools={enableTools}
        onEnableToolsChange={setEnableTools}
      />
    </div>
  );
}

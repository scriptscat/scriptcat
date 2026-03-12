import { useCallback, useEffect, useState } from "react";
import ConversationList from "./ConversationList";
import ChatArea from "./ChatArea";
import { useConversations, useSkills } from "./hooks";
import type { AgentModelConfig } from "@App/app/service/agent/types";
import { AgentModelRepo } from "@App/app/repo/agent_model";
import "./styles.css";

const agentModelRepo = new AgentModelRepo();

export default function AgentChat() {
  const [models, setModels] = useState<AgentModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");

  useEffect(() => {
    Promise.all([agentModelRepo.listModels(), agentModelRepo.getDefaultModelId()]).then(([modelList, defId]) => {
      setModels(modelList);
      setDefaultModelId(defId || modelList[0]?.id || "");
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
        selectedModelId={effectiveModelId}
        onModelChange={setSelectedModelId}
        onConversationTitleChange={handleTitleChange}
        skills={skills}
        selectedSkills={selectedSkills}
        onSkillsChange={setSelectedSkills}
      />
    </div>
  );
}

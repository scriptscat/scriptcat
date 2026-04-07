import { useState } from "react";
import { Button, Input, Popconfirm, Empty } from "@arco-design/web-react";
import {
  IconPlus,
  IconDelete,
  IconEdit,
  IconCheck,
  IconClose,
  IconMessage,
  IconDownload,
} from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { Conversation } from "@App/app/service/agent/core/types";

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onExport,
  runningIds,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
  runningIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string>("");
  const [editValue, setEditValue] = useState("");
  // 记录正在显示删除确认弹框的会话 ID，防止鼠标移开时按钮隐藏导致弹框消失
  const [deletingId, setDeletingId] = useState<string>("");

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const confirmRename = () => {
    if (editValue.trim() && editingId) {
      onRename(editingId, editValue.trim());
    }
    setEditingId("");
  };

  return (
    <div className="tw-flex tw-flex-col tw-h-full tw-w-[240px] tw-border-r tw-border-solid tw-border-[var(--color-border-2)] tw-border-y-0 tw-border-l-0 tw-bg-[var(--color-bg-1)]">
      {/* 头部 */}
      <div className="tw-p-3 tw-border-b tw-border-solid tw-border-[var(--color-border-2)] tw-border-x-0 tw-border-t-0">
        <Button
          long
          icon={<IconPlus />}
          size="small"
          onClick={onCreate}
          className="!tw-border-dashed !tw-text-[var(--color-text-2)] hover:!tw-text-[rgb(var(--arcoblue-6))] hover:!tw-border-[rgb(var(--arcoblue-6))]"
        >
          {t("agent_chat_new")}
        </Button>
      </div>

      {/* 列表 */}
      <div className="tw-flex-1 tw-overflow-y-auto tw-py-1 agent-chat-scroll">
        {conversations.length === 0 ? (
          <div className="tw-py-8">
            <Empty description={t("agent_chat_no_conversations")} />
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`agent-conversation-item tw-group tw-flex tw-items-center tw-gap-2 tw-mx-2 tw-my-0.5 tw-px-3 tw-py-2.5 tw-rounded-lg tw-cursor-pointer ${
                conv.id === activeId
                  ? "active tw-bg-[var(--color-fill-2)] tw-text-[var(--color-text-1)]"
                  : "hover:tw-bg-[var(--color-fill-1)] tw-text-[var(--color-text-2)]"
              }`}
              onClick={() => onSelect(conv.id)}
            >
              {editingId === conv.id ? (
                <div className="tw-flex tw-items-center tw-gap-1 tw-flex-1 tw-min-w-0">
                  <Input
                    size="mini"
                    value={editValue}
                    onChange={setEditValue}
                    onPressEnter={confirmRename}
                    autoFocus
                    className="tw-flex-1"
                  />
                  <Button type="text" size="mini" icon={<IconCheck />} onClick={confirmRename} />
                  <Button type="text" size="mini" icon={<IconClose />} onClick={() => setEditingId("")} />
                </div>
              ) : (
                <>
                  {runningIds?.has(conv.id) ? (
                    <span className="tw-w-2 tw-h-2 tw-rounded-full tw-bg-[rgb(var(--arcoblue-6))] tw-shrink-0 tw-animate-pulse" />
                  ) : (
                    <IconMessage className="tw-text-sm tw-text-[var(--color-text-3)] tw-shrink-0" />
                  )}
                  <span className="tw-flex-1 tw-truncate tw-text-sm">{conv.title}</span>
                  <div
                    className={`tw-items-center tw-shrink-0 ${
                      deletingId === conv.id ? "tw-flex" : "tw-hidden group-hover:tw-flex"
                    }`}
                  >
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconEdit />}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(conv);
                      }}
                    />
                    <Button
                      type="text"
                      size="mini"
                      icon={<IconDownload />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(conv.id);
                      }}
                    />
                    <Popconfirm
                      title={t("agent_chat_delete_confirm")}
                      position="top"
                      getPopupContainer={() => document.body}
                      onVisibleChange={(visible) => {
                        setDeletingId(visible ? conv.id : "");
                      }}
                      onOk={() => onDelete(conv.id)}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="mini"
                        status="danger"
                        icon={<IconDelete />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

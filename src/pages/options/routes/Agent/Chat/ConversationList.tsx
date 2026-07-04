import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Download, MessageSquare, PanelLeftClose, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Conversation } from "@App/app/service/agent/core/types";
import { cn } from "@App/pkg/utils/cn";
import { Button } from "@App/pages/components/ui/button";
import { Input } from "@App/pages/components/ui/input";
import { Popconfirm } from "@App/pages/components/ui/popconfirm";
import { SearchInput } from "@App/pages/components/ui/search-input";

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  onExport,
  onCollapse,
  runningIds,
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onExport: (id: string) => void;
  onCollapse?: () => void;
  runningIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string>("");
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

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
    <div className="flex flex-col h-full bg-card">
      {/* 面板头：标题(+折叠) / 新建 / 搜索 */}
      <div className="flex flex-col gap-3 p-4 pb-3 border-b border-border">
        {onCollapse && (
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">{t("agent:chat")}</span>
            <button
              type="button"
              data-testid="conv-collapse"
              aria-label={t("agent:chat")}
              onClick={onCollapse}
              className="size-7 flex items-center justify-center rounded-sm bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <PanelLeftClose className="size-[17px]" />
            </button>
          </div>
        )}
        <Button
          data-testid="conv-new"
          variant="ghost"
          size="sm"
          className="w-full h-9 bg-primary-light text-primary font-medium hover:bg-primary-light/80 hover:text-primary"
          onClick={onCreate}
        >
          <Plus className="size-4" />
          {t("agent:chat_new")}
        </Button>
        <SearchInput
          data-testid="conv-search"
          aria-label={t("agent:chat_search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("agent:chat_search_placeholder")}
          className="bg-input/60 transition-shadow"
          inputClassName="text-[13px]"
        />
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-custom">
        {conversations.length === 0 ? (
          <div
            data-testid="conv-empty"
            className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground"
          >
            <MessageSquare className="size-8 opacity-40" />
            <span className="text-xs">{t("agent:chat_no_conversations")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div
            data-testid="conv-search-empty"
            className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground"
          >
            <Search className="size-8 opacity-40" />
            <span className="text-xs">{t("agent:chat_search_no_results")}</span>
          </div>
        ) : (
          filtered.map((conv) => {
            const active = conv.id === activeId;
            const editing = editingId === conv.id;
            return (
              <div
                key={conv.id}
                data-testid={`conv-item-${conv.id}`}
                data-active={active}
                className={cn(
                  "group flex items-center gap-2 mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                  active ? "bg-accent text-foreground" : "hover:bg-accent/50 text-foreground/80"
                )}
                onClick={() => !editing && onSelect(conv.id)}
              >
                {editing ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    <Input
                      data-testid="conv-rename-input"
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmRename();
                        if (e.key === "Escape") setEditingId("");
                      }}
                      className="h-7 flex-1 text-sm"
                    />
                    <Button
                      data-testid="conv-rename-confirm"
                      aria-label={t("common:confirm")}
                      variant="ghost"
                      size="icon-xs"
                      onClick={confirmRename}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      aria-label={t("common:cancel")}
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditingId("")}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    {runningIds?.has(conv.id) ? (
                      <span
                        data-testid={`conv-running-${conv.id}`}
                        className="size-2 rounded-full bg-primary shrink-0 animate-pulse"
                      />
                    ) : (
                      <MessageSquare className="size-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate text-sm">{conv.title}</span>
                    <div className="items-center shrink-0 hidden group-hover:flex" onClick={(e) => e.stopPropagation()}>
                      <Button
                        data-testid={`conv-rename-${conv.id}`}
                        aria-label={t("agent:chat_rename")}
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startRename(conv)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        data-testid={`conv-export-${conv.id}`}
                        aria-label={t("agent:chat_export")}
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onExport(conv.id)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Popconfirm
                        description={t("agent:chat_delete_confirm")}
                        confirmText={t("common:confirm")}
                        destructive
                        onConfirm={() => onDelete(conv.id)}
                      >
                        <Button
                          data-testid={`conv-delete-${conv.id}`}
                          aria-label={t("agent:chat_delete")}
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </Popconfirm>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

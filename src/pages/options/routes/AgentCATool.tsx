import { Button, Card, Drawer, Empty, Message, Popconfirm, Space, Tag, Typography } from "@arco-design/web-react";
import { IconCode, IconDelete, IconEye } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState } from "react";
import type { CATToolRecord } from "@App/app/service/agent/types";
import type { CATToolSummary } from "@App/app/repo/cattool_repo";
import { CATToolRepo } from "@App/app/repo/cattool_repo";
import { agentClient } from "@App/pages/store/features/script";

const catToolRepo = new CATToolRepo();

function CATToolCard({
  tool,
  onDetail,
  onDelete,
  t,
}: {
  tool: CATToolSummary;
  onDetail: () => void;
  onDelete: () => void;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  return (
    <div className="tw-group tw-relative tw-rounded-xl tw-p-5 tw-transition-all tw-duration-200 tw-cursor-default tw-bg-[var(--color-bg-2)] tw-shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:tw-shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="tw-flex tw-items-start tw-justify-between tw-mb-3">
        <div className="tw-flex tw-items-center tw-gap-3">
          <div className="tw-w-10 tw-h-10 tw-rounded-lg tw-flex tw-items-center tw-justify-center tw-text-xs tw-font-bold tw-shrink-0 tw-bg-[rgb(var(--orange-1))] tw-text-[rgb(var(--orange-6))]">
            <IconCode />
          </div>
          <div className="tw-flex tw-flex-col tw-gap-0.5">
            <Typography.Text className="tw-font-semibold tw-text-base !tw-mb-0">{tool.name}</Typography.Text>
            {tool.description && (
              <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
                {tool.description}
              </Typography.Text>
            )}
          </div>
        </div>
      </div>

      {/* Params */}
      {tool.params.length > 0 && (
        <div className="tw-flex tw-flex-wrap tw-gap-1.5 tw-mb-3">
          {tool.params.map((p) => (
            <Tag key={p.name} size="small" color={p.required ? "arcoblue" : "gray"}>
              {p.required ? p.name : `${p.name}?`}
            </Tag>
          ))}
        </div>
      )}

      {/* Grants */}
      {tool.grants.length > 0 && (
        <div className="tw-flex tw-flex-wrap tw-gap-1.5 tw-mb-3">
          {tool.grants.map((g) => (
            <Tag key={g} size="small" color="orange">
              {g}
            </Tag>
          ))}
        </div>
      )}

      {/* Source */}
      {tool.sourceScriptName && (
        <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-3">
          {t("agent_catool_source")}
          {": "}
          {tool.sourceScriptName}
        </div>
      )}

      {/* Install time */}
      <div className="tw-text-xs tw-text-[var(--color-text-3)] tw-mb-3">
        {t("agent_catool_installed_at")}
        {": "}
        {new Date(tool.installtime).toLocaleString()}
      </div>

      {/* Actions */}
      <div className="tw-flex tw-items-center tw-justify-end tw-gap-0.5 tw-pt-3 tw-border-t tw-border-solid tw-border-[var(--color-border-1)] tw-border-x-0 tw-border-b-0 tw-opacity-60 group-hover:tw-opacity-100 tw-transition-opacity">
        <Button type="text" size="small" icon={<IconEye />} onClick={onDetail}>
          {t("agent_catool_detail")}
        </Button>
        <Popconfirm title={t("agent_catool_delete_confirm", { name: tool.name })} onOk={onDelete}>
          <Button type="text" size="small" status="danger" icon={<IconDelete />}>
            {t("agent_catool_delete")}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

function CATToolDetailDrawer({
  visible,
  tool,
  onClose,
}: {
  visible: boolean;
  tool: CATToolRecord | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  if (!tool) return null;

  return (
    <Drawer width={560} title={tool.name} visible={visible} onCancel={onClose} footer={null} unmountOnExit>
      <Space direction="vertical" size={16} className="tw-w-full">
        {/* Description */}
        {tool.description && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
              {t("agent_catool_description")}
            </div>
            <Typography.Text type="secondary">{tool.description}</Typography.Text>
          </div>
        )}

        {/* Params */}
        {tool.params.length > 0 && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_catool_params")} {"("}
              {tool.params.length}
              {")"}
            </div>
            <div className="tw-flex tw-flex-col tw-gap-2">
              {tool.params.map((p) => (
                <div key={p.name} className="tw-rounded-lg tw-p-3 tw-bg-[var(--color-fill-1)]">
                  <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
                    <Typography.Text className="tw-font-semibold tw-text-sm !tw-mb-0">{p.name}</Typography.Text>
                    <Tag size="small">{p.type}</Tag>
                    {p.required && (
                      <Tag size="small" color="arcoblue">
                        {"required"}
                      </Tag>
                    )}
                  </div>
                  {p.description && (
                    <Typography.Text type="secondary" className="tw-text-xs !tw-mb-0">
                      {p.description}
                    </Typography.Text>
                  )}
                  {p.enum && p.enum.length > 0 && (
                    <div className="tw-mt-1 tw-flex tw-gap-1 tw-flex-wrap">
                      {p.enum.map((v) => (
                        <Tag key={v} size="small" color="green">
                          {v}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grants */}
        {tool.grants.length > 0 && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
              {t("agent_catool_grants")} {"("}
              {tool.grants.length}
              {")"}
            </div>
            <div className="tw-flex tw-flex-wrap tw-gap-1.5">
              {tool.grants.map((g) => (
                <Tag key={g} color="orange">
                  {g}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Code */}
        <div>
          <div className="tw-text-sm tw-font-medium tw-mb-2 tw-text-[var(--color-text-2)]">
            {t("agent_catool_code")}
          </div>
          <pre className="tw-rounded-lg tw-p-3 tw-bg-[var(--color-fill-1)] tw-text-xs tw-font-mono tw-overflow-auto tw-max-h-80 tw-whitespace-pre-wrap tw-break-all">
            {tool.code}
          </pre>
        </div>

        {/* Source */}
        {tool.sourceScriptName && (
          <div>
            <div className="tw-text-sm tw-font-medium tw-mb-1 tw-text-[var(--color-text-2)]">
              {t("agent_catool_source")}
            </div>
            <Typography.Text type="secondary">{tool.sourceScriptName}</Typography.Text>
          </div>
        )}
      </Space>
    </Drawer>
  );
}

function AgentCATool() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<CATToolSummary[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailTool, setDetailTool] = useState<CATToolRecord | null>(null);

  const loadTools = useCallback(async () => {
    const list = await catToolRepo.listTools();
    setTools(list);
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const handleDetail = async (name: string) => {
    const record = await catToolRepo.getTool(name);
    if (record) {
      setDetailTool(record);
      setDetailVisible(true);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await agentClient.removeCATTool(name);
      Message.success(t("agent_catool_delete_success"));
      loadTools();
    } catch (e: any) {
      Message.error(e.message || String(e));
    }
  };

  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card title={t("agent_catool_title")} bordered={false}>
        {tools.length === 0 ? (
          <div className="tw-py-12">
            <Empty description={t("agent_catool_empty")} />
          </div>
        ) : (
          <div className="tw-grid tw-grid-cols-1 md:tw-grid-cols-2 tw-gap-4">
            {tools.map((tool) => (
              <CATToolCard
                key={tool.name}
                tool={tool}
                onDetail={() => handleDetail(tool.name)}
                onDelete={() => handleDelete(tool.name)}
                t={t}
              />
            ))}
          </div>
        )}
      </Card>

      <CATToolDetailDrawer visible={detailVisible} tool={detailTool} onClose={() => setDetailVisible(false)} />
    </Space>
  );
}

export default AgentCATool;

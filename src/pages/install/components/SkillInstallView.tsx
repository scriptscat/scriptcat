import { useState } from "react";
import { Button, Space, Tag, Typography } from "@arco-design/web-react";
import { IconDown, IconUp } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { parseSkillScriptMetadata } from "@App/pkg/utils/skill_script";
import type { SkillConfigField } from "@App/app/service/agent/core/types";

interface SkillInstallViewProps {
  metadata: { name: string; description: string; version?: string; config?: Record<string, SkillConfigField> };
  prompt: string;
  scripts: Array<{ name: string; code: string }>;
  references: Array<{ name: string; content: string }>;
  isUpdate: boolean;
  installUrl?: string;
  onInstall: () => void;
  onClose: () => void;
}

function SkillInstallView({
  metadata,
  prompt,
  scripts,
  references,
  isUpdate,
  installUrl,
  onInstall,
  onClose,
}: SkillInstallViewProps) {
  const { t } = useTranslation();
  const [promptExpanded, setPromptExpanded] = useState(false);

  return (
    <div id="install-app-container" className="tw-flex tw-flex-col">
      {/* Header */}
      <div className="tw-flex tw-flex-row tw-gap-x-3 tw-pt-3 tw-pb-3">
        <div className="tw-grow-1 tw-shrink-1 tw-flex tw-flex-row tw-justify-start tw-items-center">
          <Tag bordered color="purple" style={{ marginRight: "8px" }}>
            {"Skill"}
          </Tag>
          <Typography.Text bold className="tw-text-size-lg tw-truncate tw-w-0 tw-grow-1">
            {metadata.name}
          </Typography.Text>
          {metadata.version && (
            <Tag bordered color="gray" style={{ marginLeft: "8px" }}>
              {"v"}
              {metadata.version}
            </Tag>
          )}
          {isUpdate && (
            <Tag bordered color="green" style={{ marginLeft: "4px" }}>
              {t("update")}
            </Tag>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="tw-shrink-1 tw-grow-1 tw-overflow-y-auto tw-pl-4 tw-pr-4 tw-gap-y-2 tw-flex tw-flex-col tw-mb-4 tw-h-0">
        <div className="tw-flex tw-flex-wrap tw-gap-x-3 tw-gap-y-2 tw-items-start">
          <div className="tw-flex tw-flex-col tw-shrink-1 tw-grow-1 tw-basis-full">
            {/* Description */}
            {metadata.description && (
              <div className="tw-mb-2">
                <Typography.Text bold>{metadata.description}</Typography.Text>
              </div>
            )}

            {/* Install URL */}
            {installUrl && (
              <div className="tw-mb-2">
                <Typography.Text type="secondary" className="tw-text-xs">
                  {"URL: "}
                  {installUrl}
                </Typography.Text>
              </div>
            )}

            {/* Prompt */}
            {prompt && (
              <div className="tw-mb-2">
                <div
                  className="tw-flex tw-items-center tw-gap-1 tw-cursor-pointer tw-select-none"
                  onClick={() => setPromptExpanded(!promptExpanded)}
                >
                  <Typography.Text bold>
                    {t("agent_skills_prompt")}
                    {":"}
                  </Typography.Text>
                  {promptExpanded ? <IconUp /> : <IconDown />}
                </div>
                {promptExpanded ? (
                  <div className="tw-mt-1 tw-p-3 tw-rounded-lg tw-bg-[var(--color-fill-1)] tw-overflow-auto tw-max-h-80">
                    <pre className="tw-whitespace-pre-wrap tw-text-sm tw-m-0" style={{ fontFamily: "monospace" }}>
                      {prompt}
                    </pre>
                  </div>
                ) : (
                  <div className="tw-mt-1">
                    <Typography.Text type="secondary" className="tw-text-xs">
                      {prompt.length > 150 ? prompt.slice(0, 150) + "..." : prompt}
                    </Typography.Text>
                  </div>
                )}
              </div>
            )}

            {/* Tools */}
            {scripts.length > 0 && (
              <div className="tw-mt-2">
                <Typography.Text bold>{`${t("agent_skills_tools")} (${scripts.length}):`}</Typography.Text>
                <div className="tw-mt-1 tw-flex tw-flex-col tw-gap-y-2">
                  {scripts.map((script) => {
                    const toolMeta = parseSkillScriptMetadata(script.code);
                    return (
                      <div key={script.name} className="tw-p-3 tw-rounded-lg tw-bg-[var(--color-fill-1)]">
                        <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
                          <Tag bordered size="small" color="arcoblue">
                            {toolMeta?.name || script.name}
                          </Tag>
                        </div>
                        {toolMeta?.description && (
                          <Typography.Text type="secondary" className="tw-text-xs">
                            {toolMeta.description}
                          </Typography.Text>
                        )}
                        {toolMeta && toolMeta.params.length > 0 && (
                          <div className="tw-mt-1 tw-flex tw-flex-col tw-gap-y-1">
                            {toolMeta.params.map((param) => (
                              <div key={param.name} className="tw-flex tw-flex-row tw-gap-x-2 tw-items-center">
                                <Tag bordered size="small">
                                  {param.name}
                                </Tag>
                                <Tag bordered size="small" color="gray">
                                  {param.type}
                                </Tag>
                                {param.required && (
                                  <Tag bordered size="small" color="red">
                                    {t("skill_script_required")}
                                  </Tag>
                                )}
                                {param.description && (
                                  <Typography.Text type="secondary" className="tw-text-xs">
                                    {param.description}
                                  </Typography.Text>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {toolMeta && toolMeta.grants.length > 0 && (
                          <div className="tw-mt-1 tw-flex tw-flex-row tw-flex-wrap tw-gap-1">
                            {toolMeta.grants.map((grant) => (
                              <Tag key={grant} bordered size="small" color="orangered">
                                {grant}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Config Fields */}
            {metadata.config && Object.keys(metadata.config).length > 0 && (
              <div className="tw-mt-2">
                <Typography.Text
                  bold
                >{`${t("agent_skills_config")} (${Object.keys(metadata.config).length}):`}</Typography.Text>
                <div className="tw-mt-1 tw-flex tw-flex-col tw-gap-y-2">
                  {Object.entries(metadata.config).map(([key, field]) => (
                    <div key={key} className="tw-p-3 tw-rounded-lg tw-bg-[var(--color-fill-1)]">
                      <div className="tw-flex tw-items-center tw-gap-2 tw-mb-1">
                        <Tag bordered size="small" color="orange">
                          {key}
                        </Tag>
                        <Tag bordered size="small" color="gray">
                          {field.type}
                        </Tag>
                        {field.required && (
                          <Tag bordered size="small" color="red">
                            {t("skill_script_required")}
                          </Tag>
                        )}
                        {field.secret && (
                          <Tag bordered size="small" color="purple">
                            {"secret"}
                          </Tag>
                        )}
                      </div>
                      {field.title && (
                        <Typography.Text type="secondary" className="tw-text-xs">
                          {field.title}
                        </Typography.Text>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* References */}
            {references.length > 0 && (
              <div className="tw-mt-2">
                <Typography.Text bold>{`${t("agent_skills_references")} (${references.length}):`}</Typography.Text>
                <div className="tw-mt-1 tw-flex tw-flex-wrap tw-gap-1.5">
                  {references.map((ref) => (
                    <Tag key={ref.name} bordered size="small" color="green">
                      {ref.name}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Warning + Actions */}
        <div className="tw-flex tw-flex-row tw-flex-wrap tw-items-center tw-gap-2 tw-mt-4">
          <div className="tw-grow-1">
            <Typography.Text type="error">{t("install_from_legitimate_sources_warning")}</Typography.Text>
          </div>
          <div className="tw-grow-1 tw-shrink-0 tw-text-end">
            <Space>
              <Button type="primary" size="small" onClick={onInstall}>
                {isUpdate ? t("update_script") : t("install_script")}
              </Button>
              <Button type="primary" status="danger" size="small" onClick={onClose}>
                {t("close")}
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SkillInstallView;

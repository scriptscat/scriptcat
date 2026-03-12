import { Button, Space, Tag, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next";
import CodeEditor from "../../components/CodeEditor";
import type { CATToolMetadata } from "@App/app/service/agent/types";

interface CATToolInstallViewProps {
  metadata: CATToolMetadata;
  scriptCode: string;
  onInstall: () => void;
  onClose: () => void;
  sourceScriptName?: string;
  isUpdate?: boolean;
}

function CATToolInstallView({ metadata, scriptCode, onInstall, onClose, sourceScriptName, isUpdate }: CATToolInstallViewProps) {
  const { t } = useTranslation();

  return (
    <div id="install-app-container" className="tw-flex tw-flex-col">
      <div className="tw-flex tw-flex-row tw-gap-x-3 tw-pt-3 tw-pb-3">
        <div className="tw-grow-1 tw-shrink-1 tw-flex tw-flex-row tw-justify-start tw-items-center">
          <Tag bordered color="arcoblue" style={{ marginRight: "8px" }}>
            CATTool
          </Tag>
          <Typography.Text bold className="tw-text-size-lg tw-truncate tw-w-0 tw-grow-1">
            {metadata.name}
          </Typography.Text>
          {isUpdate && (
            <Tag bordered color="green" style={{ marginLeft: "8px" }}>
              {t("update")}
            </Tag>
          )}
        </div>
      </div>
      <div className="tw-shrink-1 tw-grow-1 tw-overflow-y-auto tw-pl-4 tw-pr-4 tw-gap-y-2 tw-flex tw-flex-col tw-mb-4 tw-h-0">
        <div className="tw-flex tw-flex-wrap tw-gap-x-3 tw-gap-y-2 tw-items-start">
          <div className="tw-flex tw-flex-col tw-shrink-1 tw-grow-1 tw-basis-8/12">
            {sourceScriptName && (
              <div className="tw-mb-1">
                <Typography.Text type="secondary">
                  {t("cattool_source_script")}: {sourceScriptName}
                </Typography.Text>
              </div>
            )}
            {metadata.description && (
              <div>
                <Typography.Text bold>{metadata.description}</Typography.Text>
              </div>
            )}
            {metadata.params.length > 0 && (
              <div className="tw-mt-2">
                <Typography.Text bold>{t("cattool_parameters")}:</Typography.Text>
                <div className="tw-mt-1 tw-flex tw-flex-col tw-gap-y-1">
                  {metadata.params.map((param) => (
                    <div key={param.name} className="tw-flex tw-flex-row tw-gap-x-2 tw-items-center">
                      <Tag bordered size="small">
                        {param.name}
                      </Tag>
                      <Tag bordered size="small" color="gray">
                        {param.type}
                      </Tag>
                      {param.required && (
                        <Tag bordered size="small" color="red">
                          {t("cattool_required")}
                        </Tag>
                      )}
                      {param.description && <Typography.Text type="secondary">{param.description}</Typography.Text>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {metadata.grants.length > 0 && (
              <div className="tw-mt-2">
                <Typography.Text bold>{t("cattool_permissions")}:</Typography.Text>
                <div className="tw-mt-1 tw-flex tw-flex-row tw-flex-wrap tw-gap-1">
                  {metadata.grants.map((grant) => (
                    <Tag key={grant} bordered size="small" color="orangered">
                      {grant}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="tw-flex tw-flex-row tw-flex-wrap tw-items-center tw-gap-2">
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
        <div id="show-code-container">
          <CodeEditor id="show-code" className="sc-inset-0" code={scriptCode || undefined} diffCode="" />
        </div>
      </div>
    </div>
  );
}

export default CATToolInstallView;

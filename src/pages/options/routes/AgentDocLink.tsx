import { Button, Tooltip } from "@arco-design/web-react";
import { IconQuestionCircle } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import { DocumentationSite } from "@App/app/const";
import { localePath } from "@App/locales/locales";

// Agent 各页面对应的文档路径
const DOC_PATHS: Record<string, string> = {
  provider: "agent-model",
  skills: "agent-skill-install",
  mcp: "agent-mcp",
  tasks: "agent-task",
  opfs: "agent-opfs",
  settings: "agent",
};

function AgentDocLink({ page }: { page: keyof typeof DOC_PATHS }) {
  const { t } = useTranslation();
  const docPath = DOC_PATHS[page];
  return (
    <Tooltip content={t("agent_doc_link")} getPopupContainer={() => document.body}>
      <a href={`${DocumentationSite}${localePath}/docs/dev/agent/${docPath}`} target="_blank" rel="noreferrer">
        <Button icon={<IconQuestionCircle />} type="text" size="small" />
      </a>
    </Tooltip>
  );
}

export default AgentDocLink;

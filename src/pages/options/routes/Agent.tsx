import { Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, Space, Typography } from "@arco-design/web-react";
import AgentProvider from "./AgentProvider";
import AgentChat from "./AgentChat";
import AgentMcp from "./AgentMcp";
import AgentOPFS from "./AgentOPFS";

function ComingSoon() {
  const { t } = useTranslation();
  return (
    <Space className="tw-w-full tw-h-full tw-overflow-auto tw-relative" direction="vertical">
      <Card bordered={false}>
        <Typography.Text type="secondary">{t("agent_coming_soon")}</Typography.Text>
      </Card>
    </Space>
  );
}

function Agent() {
  return (
    <Routes>
      <Route path="/chat" element={<AgentChat />} />
      <Route path="/provider" element={<AgentProvider />} />
      <Route path="/mcp" element={<AgentMcp />} />
      <Route path="/skills" element={<ComingSoon />} />
      <Route path="/opfs" element={<AgentOPFS />} />
      <Route path="*" element={<AgentChat />} />
    </Routes>
  );
}

export default Agent;

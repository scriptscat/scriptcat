import { Space, Typography } from "@arco-design/web-react";
import { useTranslation } from "react-i18next";
import { useInstallData } from "./hooks";
import SkillInstallView from "./components/SkillInstallView";
import ScriptInstallView from "./components/ScriptInstallView";

function App() {
  const data = useInstallData();
  const { t } = useTranslation();

  // Skill ZIP 安装
  if (data.skillPreview) {
    return (
      <SkillInstallView
        metadata={data.skillPreview.metadata}
        prompt={data.skillPreview.prompt}
        scripts={data.skillPreview.scripts}
        references={data.skillPreview.references}
        isUpdate={data.skillPreview.isUpdate}
        installUrl={data.skillPreview.installUrl}
        onInstall={data.handleSkillInstall}
        onClose={data.handleSkillCancel}
      />
    );
  }

  // URL 加载中 / 错误 / 无效页面
  if (!data.hasValidSourceParam) {
    return data.urlHref ? (
      <div className="tw-flex tw-justify-center tw-items-center tw-h-screen">
        <Space direction="vertical" align="center">
          {data.fetchingState.loadingStatus && (
            <>
              <Typography.Title heading={3}>{t("install_page_loading")}</Typography.Title>
              <div className="downloading">
                <Typography.Text>{data.fetchingState.loadingStatus}</Typography.Text>
                <div className="loader"></div>
              </div>
            </>
          )}
          {data.fetchingState.errorStatus && (
            <>
              <Typography.Title heading={3}>{t("install_page_load_failed")}</Typography.Title>
              <div className="error-message">{data.fetchingState.errorStatus}</div>
            </>
          )}
        </Space>
      </div>
    ) : (
      <div className="tw-flex tw-justify-center tw-items-center tw-h-screen">
        <Space direction="vertical" align="center">
          <Typography.Title heading={3}>{t("invalid_page")}</Typography.Title>
        </Space>
      </div>
    );
  }

  // UserScript / Subscribe 安装
  return <ScriptInstallView data={data} />;
}

export default App;

import {
  Button,
  Dropdown,
  Menu,
  Modal,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Popover,
  Message,
} from "@arco-design/web-react";
import { IconDown } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import CodeEditor from "../../components/CodeEditor";
import { i18nName, i18nDescription } from "@App/locales/locales";
import { ScriptIcons } from "../../options/routes/utils";
import { prettyUrl } from "@App/pkg/utils/url-utils";
import { backgroundPromptShownKey } from "../utils";
import type { InstallData } from "../hooks";

function ScriptInstallView({ data }: { data: InstallData }) {
  const {
    enable,
    btnText,
    scriptCode,
    scriptInfo,
    upsertScript,
    diffCode,
    oldScriptVersion,
    isUpdate,
    localFileHandle,
    showBackgroundPrompt,
    setShowBackgroundPrompt,
    watchFile,
    metadataLive,
    permissions,
    descriptionParagraph,
    antifeatures,
    handleInstallBasic,
    handleInstallCloseAfterInstall,
    handleInstallNoMoreUpdates,
    handleStatusChange,
    handleCloseBasic,
    handleCloseNoMoreUpdates,
    setWatchFileClick,
  } = data;
  const { t } = useTranslation();

  return (
    <div id="install-app-container" className="tw-flex tw-flex-col">
      {/* 后台运行提示对话框 */}
      <Modal
        title={t("enable_background.prompt_title")}
        visible={showBackgroundPrompt}
        onOk={async () => {
          try {
            const granted = await chrome.permissions.request({ permissions: ["background"] });
            if (granted) {
              Message.success(t("enable_background.title")!);
            } else {
              Message.info(t("enable_background.maybe_later")!);
            }
            setShowBackgroundPrompt(false);
            localStorage.setItem(backgroundPromptShownKey, "true");
          } catch (e) {
            console.error(e);
            Message.error(t("enable_background.enable_failed")!);
          }
        }}
        onCancel={() => {
          setShowBackgroundPrompt(false);
          localStorage.setItem(backgroundPromptShownKey, "true");
        }}
        okText={t("enable_background.enable_now")}
        cancelText={t("enable_background.maybe_later")}
        autoFocus={false}
        focusLock={true}
      >
        <Space direction="vertical" size="medium">
          <Typography.Text>
            {t("enable_background.prompt_description", {
              scriptType: upsertScript?.metadata?.background ? t("background_script") : t("scheduled_script"),
            })}
          </Typography.Text>
          <Typography.Text type="secondary">{t("enable_background.settings_hint")}</Typography.Text>
        </Space>
      </Modal>
      <div className="tw-flex tw-flex-row tw-gap-x-3 tw-pt-3 tw-pb-3">
        <div className="tw-grow-1 tw-shrink-1 tw-flex tw-flex-row tw-justify-start tw-items-center">
          {upsertScript?.metadata.icon && <ScriptIcons script={upsertScript} size={32} />}
          {upsertScript && (
            <Tooltip position="tl" content={i18nName(upsertScript)}>
              <Typography.Text bold className="tw-text-size-lg tw-truncate tw-w-0 tw-grow-1">
                {i18nName(upsertScript)}
              </Typography.Text>
            </Tooltip>
          )}
          <Tooltip content={scriptInfo?.userSubscribe ? t("subscribe_source_tooltip") : t("script_status_tooltip")}>
            <Switch style={{ marginLeft: "8px" }} checked={enable} onChange={handleStatusChange} />
          </Tooltip>
        </div>
        <div className="tw-grow-0 tw-shrink-1 tw-flex tw-flex-row tw-flex-wrap tw-gap-x-2 tw-gap-y-1 tw-items-center">
          <div className="tw-flex tw-flex-row tw-flex-nowrap tw-gap-x-2">
            {oldScriptVersion && (
              <Tooltip content={`${t("current_version")}: v${oldScriptVersion}`}>
                <Tag bordered>{oldScriptVersion}</Tag>
              </Tooltip>
            )}
            {typeof metadataLive.version?.[0] === "string" && metadataLive.version[0] !== oldScriptVersion && (
              <Tooltip color="red" content={`${t("update_version")}: v${metadataLive.version[0]}`}>
                <Tag bordered color="red">
                  {metadataLive.version[0]}
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className="tw-shrink-1 tw-grow-1 tw-overflow-y-auto tw-pl-4 tw-pr-4 tw-gap-y-2 tw-flex tw-flex-col tw-mb-4 tw-h-0">
        <div className="tw-flex tw-flex-wrap tw-gap-x-3 tw-gap-y-2 tw-items-start">
          <div className="tw-flex tw-flex-col tw-shrink-1 tw-grow-1 tw-basis-8/12">
            <div className="tw-grow-1 tw-shrink-0">
              <div className="tw-flex tw-flex-wrap tw-gap-x-2 tw-gap-y-1 tag-container tw-float-right">
                {(metadataLive.background || metadataLive.crontab) && (
                  <Tooltip color="green" content={t("background_script_tag")}>
                    <Tag bordered color="green">
                      {t("background_script")}
                    </Tag>
                  </Tooltip>
                )}
                {metadataLive.crontab && (
                  <Tooltip color="green" content={t("scheduled_script_tag")}>
                    <Tag bordered color="green">
                      {t("scheduled_script")}
                    </Tag>
                  </Tooltip>
                )}
                {metadataLive.antifeature?.length &&
                  metadataLive.antifeature.map((antifeature) => {
                    const item = antifeature.split(" ")[0];
                    return (
                      antifeatures[item] && (
                        <Tooltip key={item} color={antifeatures[item].color} content={antifeatures[item].description}>
                          <Tag bordered color={antifeatures[item].color}>
                            {antifeatures[item].title}
                          </Tag>
                        </Tooltip>
                      )
                    );
                  })}
              </div>
              <div>
                <div>
                  <Typography.Text bold>{upsertScript && i18nDescription(upsertScript!)}</Typography.Text>
                </div>
                <div>
                  <Typography.Text bold>{`${t("author")}: ${metadataLive.author}`}</Typography.Text>
                </div>
                <div>
                  <Typography.Text
                    bold
                    style={{
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                      maxHeight: "70px",
                      display: "block",
                      overflowY: "auto",
                    }}
                  >
                    {`${t("source")}: ${prettyUrl(scriptInfo?.url)}`}
                  </Typography.Text>
                </div>
              </div>
            </div>
          </div>
          {descriptionParagraph?.length ? (
            <div className="tw-flex tw-flex-col tw-shrink-0 tw-grow-1">
              <Typography>
                <Typography.Paragraph blockquote className="tw-pt-2 tw-pb-2">
                  {descriptionParagraph}
                </Typography.Paragraph>
              </Typography>
            </div>
          ) : (
            <></>
          )}
          <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-x-4">
            {permissions.map((item) => (
              <div key={item.label} className="tw-flex tw-flex-col tw-gap-y-2">
                {item.value?.length > 0 ? (
                  <>
                    <Typography.Text bold color={item.color}>
                      {item.label}
                    </Typography.Text>
                    <div
                      style={{
                        maxHeight: "calc( 7.5 * 1.2rem )",
                        overflowY: "auto",
                        overflowX: "auto",
                        boxSizing: "border-box",
                      }}
                    >
                      {item.value.map((v) => (
                        <div key={v} className="permission-entry">
                          <Typography.Text style={{ wordBreak: "unset", color: item.color }}>{v}</Typography.Text>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <></>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="tw-flex tw-flex-row tw-flex-wrap tw-items-center tw-gap-2">
          <div className="tw-grow-1">
            <Typography.Text type="error">{t("install_from_legitimate_sources_warning")}</Typography.Text>
          </div>
          <div className="tw-grow-1 tw-shrink-0 tw-text-end">
            <Space>
              <Button.Group>
                <Button type="primary" size="small" onClick={handleInstallBasic} disabled={watchFile}>
                  {btnText}
                </Button>
                <Dropdown
                  droplist={
                    <Menu>
                      <Menu.Item key="install-no-close" onClick={handleInstallCloseAfterInstall}>
                        {isUpdate ? t("update_script_no_close") : t("install_script_no_close")}
                      </Menu.Item>
                      {!scriptInfo?.userSubscribe && (
                        <Menu.Item key="install-no-updates" onClick={handleInstallNoMoreUpdates}>
                          {isUpdate ? t("update_script_no_more_update") : t("install_script_no_more_update")}
                        </Menu.Item>
                      )}
                    </Menu>
                  }
                  position="bottom"
                  disabled={watchFile}
                >
                  <Button type="primary" size="small" icon={<IconDown />} disabled={watchFile} />
                </Dropdown>
              </Button.Group>
              {localFileHandle && (
                <Popover content={t("watch_file_description")}>
                  <Button type="secondary" size="small" onClick={setWatchFileClick}>
                    {watchFile ? t("stop_watch_file") : t("watch_file")}
                  </Button>
                </Popover>
              )}
              {isUpdate ? (
                <Button.Group>
                  <Button type="primary" status="danger" size="small" onClick={handleCloseBasic}>
                    {t("close")}
                  </Button>
                  <Dropdown
                    droplist={
                      <Menu>
                        {!scriptInfo?.userSubscribe && (
                          <Menu.Item key="install-no-updates" onClick={handleCloseNoMoreUpdates}>
                            {t("close_update_script_no_more_update")}
                          </Menu.Item>
                        )}
                      </Menu>
                    }
                    position="bottom"
                  >
                    <Button type="primary" status="danger" size="small" icon={<IconDown />} />
                  </Dropdown>
                </Button.Group>
              ) : (
                <Button type="primary" status="danger" size="small" onClick={handleCloseBasic}>
                  {t("close")}
                </Button>
              )}
            </Space>
          </div>
        </div>
        <div id="show-code-container">
          <CodeEditor
            id="show-code"
            className="sc-inset-0"
            code={scriptCode || undefined}
            diffCode={diffCode === scriptCode ? "" : diffCode || ""}
          />
        </div>
      </div>
    </div>
  );
}

export default ScriptInstallView;

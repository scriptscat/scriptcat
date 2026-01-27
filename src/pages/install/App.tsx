import {
  Avatar,
  Button,
  Dropdown,
  Grid,
  Message,
  Menu,
  Modal,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  Popover,
} from "@arco-design/web-react";
import { IconDown } from "@arco-design/web-react/icon";
import { v4 as uuidv4 } from "uuid";
import CodeEditor from "../components/CodeEditor";
import { useEffect, useMemo, useState } from "react";
import type { SCMetadata, Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_DISABLE, SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import type { Subscribe } from "@App/app/repo/subscribe";
import { i18nDescription, i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { createScriptInfo, type ScriptInfo } from "@App/pkg/utils/scriptInstall";
import { parseMetadata, prepareScriptByCode, prepareSubscribeByCode } from "@App/pkg/utils/script";
import { nextTime } from "@App/pkg/utils/cron";
import { scriptClient, subscribeClient } from "../store/features/script";
import { type FTInfo, startFileTrack, unmountFileTrack } from "@App/pkg/utils/file-tracker";
import { cleanupOldHandles, loadHandle, saveHandle } from "@App/pkg/utils/filehandle-db";
import { dayFormat } from "@App/pkg/utils/day_format";
import { intervalExecution, timeoutExecution } from "@App/pkg/utils/timer";

const backgroundPromptShownKey = "background_prompt_shown";

type ScriptOrSubscribe = Script | Subscribe;

// Types
interface PermissionItem {
  label: string;
  color?: string;
  value: string[];
}

type Permission = PermissionItem[];

const closeWindow = () => {
  window.close();
};

const cIdKey = `(cid_${Math.random()})`;

function App() {
  const [enable, setEnable] = useState<boolean>(false);
  const [btnText, setBtnText] = useState<string>("");
  const [scriptCode, setScriptCode] = useState<string>("");
  const [scriptInfo, setScriptInfo] = useState<ScriptInfo>();
  const [upsertScript, setUpsertScript] = useState<ScriptOrSubscribe | undefined>(undefined);
  const [diffCode, setDiffCode] = useState<string>();
  const [oldScriptVersion, setOldScriptVersion] = useState<string | null>(null);
  const [isUpdate, setIsUpdate] = useState<boolean>(false);
  const [localFileHandle, setLocalFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [showBackgroundPrompt, setShowBackgroundPrompt] = useState<boolean>(false);
  const { t } = useTranslation();

  const installOrUpdateScript = async (newScript: Script, code: string) => {
    if (newScript.ignoreVersion) newScript.ignoreVersion = "";
    await scriptClient.install(newScript, code);
    const metadata = newScript.metadata;
    setScriptInfo((prev) => (prev ? { ...prev, code, metadata } : prev));
    setOldScriptVersion(metadata!.version![0]);
    setUpsertScript(newScript);
    setDiffCode(code);
  };

  const getUpdatedNewScript = async (uuid: string, code: string) => {
    const oldScript = await scriptClient.info(uuid);
    if (!oldScript || oldScript.uuid !== uuid) {
      throw new Error("uuid is mismatched");
    }
    const { script } = await prepareScriptByCode(code, oldScript.origin || "", uuid);
    script.origin = oldScript.origin || script.origin || "";
    if (!script.name) {
      throw new Error(t("script_name_cannot_be_set_to_empty"));
    }
    return script;
  };

  const initAsync = async () => {
    try {
      const locationUrl = new URL(window.location.href);
      const uuid = locationUrl.searchParams.get("uuid");
      let info: ScriptInfo | undefined;
      let isKnownUpdate: boolean = false;
      if (uuid) {
        const cachedInfo = await scriptClient.getInstallInfo(uuid);
        if (cachedInfo?.[0]) isKnownUpdate = true;
        info = cachedInfo?.[1] || undefined;
        if (!info) {
          throw new Error("fetch script info failed");
        }
      } else {
        // 检查是不是本地文件安装
        const fid = locationUrl.searchParams.get("file");
        if (!fid) {
          throw new Error("url param - local file id is not found");
        }
        const fileHandle = await loadHandle(fid);
        if (!fileHandle) {
          throw new Error("invalid file access - fileHandle is null");
        }
        const file = await fileHandle.getFile();
        if (!file) {
          throw new Error("invalid file access - file is null");
        }
        // 处理本地文件的安装流程
        // 处理成info对象
        setLocalFileHandle((prev) => {
          if (prev instanceof FileSystemFileHandle) unmountFileTrack(prev);
          return fileHandle!;
        });

        // 刷新 timestamp, 使 10s~15s 后不会被立即清掉
        // 每五分钟刷新一次db记录的timestamp，使开启中的安装页面的fileHandle不会被刷掉
        intervalExecution(`${cIdKey}liveFileHandle`, () => saveHandle(fid, fileHandle), 5 * 60 * 1000, true);

        const code = await file.text();
        const metadata = parseMetadata(code);
        if (!metadata) {
          throw new Error("parse script info failed");
        }
        info = createScriptInfo(uuidv4(), code, `file:///*from-local*/${file.name}`, "user", metadata);
      }

      let prepare:
        | { script: Script; oldScript?: Script; oldScriptCode?: string }
        | { subscribe: Subscribe; oldSubscribe?: Subscribe };
      let action: Script | Subscribe;

      const { code, url } = info;
      let oldVersion: string | undefined = undefined;
      let diffCode: string | undefined = undefined;
      if (info.userSubscribe) {
        prepare = await prepareSubscribeByCode(code, url);
        action = prepare.subscribe;
        if (prepare.oldSubscribe) {
          oldVersion = prepare.oldSubscribe!.metadata!.version![0] || "";
        }
        diffCode = prepare.oldSubscribe?.code;
      } else {
        const knownUUID = isKnownUpdate ? info.uuid : undefined;
        prepare = await prepareScriptByCode(code, url, knownUUID);
        action = prepare.script;
        if (prepare.oldScript) {
          oldVersion = prepare.oldScript!.metadata!.version![0] || "";
        }
        diffCode = prepare.oldScriptCode;
      }
      setScriptCode(code);
      setDiffCode(diffCode);
      setOldScriptVersion(typeof oldVersion === "string" ? oldVersion : null);
      setIsUpdate(typeof oldVersion === "string");
      setScriptInfo(info);
      setUpsertScript(action);

      // 检查是否需要显示后台运行提示
      if (!info.userSubscribe) {
        setShowBackgroundPrompt(await checkBackgroundPrompt(action as Script));
      }
    } catch (e: any) {
      Message.error(t("script_info_load_failed") + " " + e.message);
    } finally {
      // fileHandle 保留处理方式（暂定）：
      // fileHandle 会保留一段足够时间，避免用户重新刷画面，重启浏览器等操作后，安装页变得空白一片。
      // 处理会在所有Tab都载入后（不包含睡眠Tab）进行，因此延迟 10s~15s 让处理有足够时间。
      // 安装页面关掉后15分钟为不保留状态，会在安装画面再次打开时（其他脚本安装），进行清除。
      const delay = Math.floor(5000 * Math.random()) + 10000; // 使用乱数时间避免浏览器重启时大量Tabs同时执行DB清除
      timeoutExecution(`${cIdKey}cleanupFileHandle`, cleanupOldHandles, delay);
    }
  };

  useEffect(() => {
    initAsync();
  }, []);

  const [watchFile, setWatchFile] = useState(false);
  const metadataLive = useMemo(() => (scriptInfo?.metadata || {}) as SCMetadata, [scriptInfo]);

  const permissions = useMemo(() => {
    const permissions: Permission = [];

    if (!scriptInfo) return permissions;

    if (scriptInfo.userSubscribe) {
      permissions.push({
        label: t("subscribe_install_label"),
        color: "#ff0000",
        value: metadataLive.scripturl!,
      });
    }

    if (metadataLive.match) {
      permissions.push({ label: t("script_runs_in"), value: metadataLive.match });
    }

    if (metadataLive.connect) {
      permissions.push({
        label: t("script_has_full_access_to"),
        color: "#F9925A",
        value: metadataLive.connect,
      });
    }

    if (metadataLive.require) {
      permissions.push({ label: t("script_requires"), value: metadataLive.require });
    }

    return permissions;
  }, [scriptInfo, metadataLive]);

  const description = useMemo(() => {
    const description: JSX.Element[] = [];

    if (!scriptInfo) return description;

    const isCookie = metadataLive.grant?.some((val) => val === "GM_cookie");
    if (isCookie) {
      description.push(
        <Typography.Text type="error" key="cookie">
          {t("cookie_warning")}
        </Typography.Text>
      );
    }

    if (metadataLive.crontab) {
      description.push(<Typography.Text key="crontab">{t("scheduled_script_description_title")}</Typography.Text>);
      description.push(
        <Typography.Text key="cronta-nexttime">
          {t("scheduled_script_description_description", {
            expression: metadataLive.crontab[0],
            time: nextTime(metadataLive.crontab[0]),
          })}
        </Typography.Text>
      );
    } else if (metadataLive.background) {
      description.push(<Typography.Text key="background">{t("background_script_description")}</Typography.Text>);
    }

    return description;
  }, [scriptInfo, metadataLive]);

  const antifeatures: { [key: string]: { color: string; title: string; description: string } } = {
    "referral-link": {
      color: "purple",
      title: t("antifeature_referral_link_title"),
      description: t("antifeature_referral_link_description"),
    },
    ads: {
      color: "orange",
      title: t("antifeature_ads_title"),
      description: t("antifeature_ads_description"),
    },
    payment: {
      color: "magenta",
      title: t("antifeature_payment_title"),
      description: t("antifeature_payment_description"),
    },
    miner: {
      color: "orangered",
      title: t("antifeature_miner_title"),
      description: t("antifeature_miner_description"),
    },
    membership: {
      color: "blue",
      title: t("antifeature_membership_title"),
      description: t("antifeature_membership_description"),
    },
    tracking: {
      color: "pinkpurple",
      title: t("antifeature_tracking_title"),
      description: t("antifeature_tracking_description"),
    },
  };

  // 更新按钮文案和页面标题
  useEffect(() => {
    if (scriptInfo?.userSubscribe) {
      setBtnText(isUpdate ? t("update_subscribe")! : t("install_subscribe"));
    } else {
      setBtnText(isUpdate ? t("update_script")! : t("install_script"));
    }
    if (upsertScript) {
      document.title = `${!isUpdate ? t("install_script") : t("update_script")} - ${i18nName(upsertScript!)} - ScriptCat`;
    }
  }, [isUpdate, scriptInfo, upsertScript]);

  // 设置脚本状态
  useEffect(() => {
    if (upsertScript) {
      setEnable(upsertScript.status === SCRIPT_STATUS_ENABLE);
    }
  }, [upsertScript]);

  // 检查是否需要显示后台运行提示
  const checkBackgroundPrompt = async (script: Script) => {
    // 只有后台脚本或定时脚本才提示
    if (!script.metadata.background && !script.metadata.crontab) {
      return false;
    }

    // 检查是否首次安装或更新
    const hasShown = localStorage.getItem(backgroundPromptShownKey);

    if (hasShown !== "true") {
      // 检查是否已经有后台权限
      if (!(await chrome.permissions.contains({ permissions: ["background"] }))) {
        return true;
      }
    }
    return false;
  };

  const handleInstall = async (options: { closeAfterInstall?: boolean; noMoreUpdates?: boolean } = {}) => {
    if (!upsertScript) {
      Message.error(t("script_info_load_failed")!);
      return;
    }

    const { closeAfterInstall: shouldClose = true, noMoreUpdates: disableUpdates = false } = options;

    try {
      if (scriptInfo?.userSubscribe) {
        await subscribeClient.install(upsertScript as Subscribe);
        Message.success(t("subscribe_success")!);
        setBtnText(t("subscribe_success")!);
      } else {
        // 如果选择不再检查更新，可以在这里设置脚本的更新配置
        if (disableUpdates && upsertScript) {
          // 这里可以设置脚本禁用自动更新的逻辑
          (upsertScript as Script).checkUpdate = false;
        }
        // 故意只安装或执行，不改变显示内容
        await scriptClient.install(upsertScript as Script, scriptCode);
        if (isUpdate) {
          Message.success(t("install.update_success")!);
          setBtnText(t("install.update_success")!);
        } else {
          // 如果选择不再检查更新，可以在这里设置脚本的更新配置
          if (disableUpdates && upsertScript) {
            // 这里可以设置脚本禁用自动更新的逻辑
            (upsertScript as Script).checkUpdate = false;
          }
          if ((upsertScript as Script).ignoreVersion) (upsertScript as Script).ignoreVersion = "";
          // 故意只安装或执行，不改变显示内容
          await scriptClient.install(upsertScript as Script, scriptCode);
          if (isUpdate) {
            Message.success(t("install.update_success")!);
            setBtnText(t("install.update_success")!);
          } else {
            Message.success(t("install_success")!);
            setBtnText(t("install_success")!);
          }
        }
      }

      if (shouldClose) {
        setTimeout(() => {
          closeWindow();
        }, 500);
      }
    } catch (e) {
      const errorMessage = scriptInfo?.userSubscribe ? t("subscribe_failed") : t("install_failed");
      Message.error(`${errorMessage}: ${e}`);
    }
  };

  const handleClose = (options?: { noMoreUpdates: boolean }) => {
    const { noMoreUpdates = false } = options || {};
    if (noMoreUpdates && scriptInfo && !scriptInfo.userSubscribe) {
      scriptClient.setCheckUpdateUrl(scriptInfo.uuid, false);
    }
    closeWindow();
  };

  const {
    handleInstallBasic,
    handleInstallCloseAfterInstall,
    handleInstallNoMoreUpdates,
    handleStatusChange,
    handleCloseBasic,
    handleCloseNoMoreUpdates,
    setWatchFileClick,
  } = {
    handleInstallBasic: () => handleInstall(),
    handleInstallCloseAfterInstall: () => handleInstall({ closeAfterInstall: false }),
    handleInstallNoMoreUpdates: () => handleInstall({ noMoreUpdates: true }),
    handleStatusChange: (checked: boolean) => {
      setUpsertScript((script) => {
        if (!script) {
          return script;
        }
        script.status = checked ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE;
        setEnable(checked);
        return script;
      });
    },
    handleCloseBasic: () => handleClose(),
    handleCloseNoMoreUpdates: () => handleClose({ noMoreUpdates: true }),
    setWatchFileClick: () => {
      setWatchFile((prev) => !prev);
    },
  };

  const fileWatchMessageId = `id_${Math.random()}`;

  async function onWatchFileCodeChanged(this: FTInfo, code: string, hideInfo: boolean = false) {
    if (this.uuid !== scriptInfo?.uuid) return;
    if (this.fileName !== localFileHandle?.name) return;
    setScriptCode(code);
    const uuid = (upsertScript as Script)?.uuid;
    if (!uuid) {
      throw new Error("uuid is undefined");
    }
    try {
      const newScript = await getUpdatedNewScript(uuid, code);
      await installOrUpdateScript(newScript, code);
    } catch (e) {
      Message.error({
        id: fileWatchMessageId,
        content: t("install_failed") + ": " + e,
      });
      return;
    }
    if (!hideInfo) {
      Message.info({
        id: fileWatchMessageId,
        content: `${t("last_updated")}: ${dayFormat()}`,
        duration: 3000,
        closable: true,
        showIcon: true,
      });
    }
  }

  async function onWatchFileError() {
    // e.g. NotFoundError
    setWatchFile(false);
  }

  const memoWatchFile = useMemo(() => {
    return `${watchFile}.${scriptInfo?.uuid}.${localFileHandle?.name}`;
  }, [watchFile, scriptInfo, localFileHandle]);

  const setupWatchFile = async (uuid: string, fileName: string, handle: FileSystemFileHandle) => {
    try {
      // 如没有安装纪录，将进行安装。
      // 如已经安装，在FileSystemObserver检查更改前，先进行更新。
      const code = `${scriptCode}`;
      await installOrUpdateScript(upsertScript as Script, code);
      // setScriptCode(`${code}`);
      setDiffCode(`${code}`);
      const ftInfo: FTInfo = {
        uuid,
        fileName,
        setCode: onWatchFileCodeChanged,
        onFileError: onWatchFileError,
      };
      // 进行监听
      startFileTrack(handle, ftInfo);
      // 先取最新代码
      const file = await handle.getFile();
      const currentCode = await file.text();
      // 如不一致，先更新
      if (currentCode !== code) {
        ftInfo.setCode(currentCode, true);
      }
    } catch (e: any) {
      Message.error(`${e.message}`);
      console.warn(e);
    }
  };

  useEffect(() => {
    if (!watchFile || !localFileHandle) {
      return;
    }
    // 去除React特性
    const [handle] = [localFileHandle];
    unmountFileTrack(handle); // 避免重复追踪
    const uuid = scriptInfo?.uuid;
    const fileName = handle?.name;
    if (!uuid || !fileName) {
      return;
    }
    setupWatchFile(uuid, fileName, handle);
    return () => {
      unmountFileTrack(handle);
    };
  }, [memoWatchFile]);

  return (
    <div id="install-app-container">
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

      <Grid.Row className="mb-2" gutter={8}>
        <Grid.Col flex={1} className="flex-col p-8px">
          <Space direction="vertical" className="w-full">
            <div>
              {upsertScript?.metadata.icon && (
                <Avatar size={32} shape="square" style={{ marginRight: "8px" }}>
                  <img src={upsertScript.metadata.icon[0]} alt={upsertScript.name} />
                </Avatar>
              )}
              <Typography.Text bold className="text-size-lg">
                {upsertScript && i18nName(upsertScript)}
                <Tooltip
                  content={scriptInfo?.userSubscribe ? t("subscribe_source_tooltip") : t("script_status_tooltip")}
                >
                  <Switch style={{ marginLeft: "8px" }} checked={enable} onChange={handleStatusChange} />
                </Tooltip>
              </Typography.Text>
            </div>
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
                  wordBreak: "break-all",
                  maxHeight: "70px",
                  display: "block",
                  overflowY: "auto",
                }}
              >
                {`${t("source")}: ${scriptInfo?.url}`}
              </Typography.Text>
            </div>
            <div className="text-end">
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
          </Space>
        </Grid.Col>
        <Grid.Col flex={1} className="p-8px">
          <Space direction="vertical">
            <div>
              <Space>
                {oldScriptVersion && (
                  <Tooltip content={`${t("current_version")}: v${oldScriptVersion}`}>
                    <Tag bordered>{oldScriptVersion}</Tag>
                  </Tooltip>
                )}
                {metadataLive.version && metadataLive.version[0] !== oldScriptVersion && (
                  <Tooltip color="red" content={`${t("update_version")}: v${metadataLive.version[0]}`}>
                    <Tag bordered color="red">
                      {metadataLive.version[0]}
                    </Tag>
                  </Tooltip>
                )}
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
                {metadataLive.antifeature &&
                  metadataLive.antifeature.map((antifeature) => {
                    const item = antifeature.split(" ")[0];
                    return (
                      antifeatures[item] && (
                        <Tooltip color={antifeatures[item].color} content={antifeatures[item].description}>
                          <Tag bordered color={antifeatures[item].color}>
                            {antifeatures[item].title}
                          </Tag>
                        </Tooltip>
                      )
                    );
                  })}
              </Space>
            </div>
            {description && description}
            <div>
              <Typography.Text type="error">{t("install_from_legitimate_sources_warning")}</Typography.Text>
            </div>
          </Space>
        </Grid.Col>
        <Grid.Col span={24}>
          <Grid.Row>
            {permissions.map((item) => (
              <Grid.Col
                key={item.label}
                span={8}
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  overflowX: "auto",
                  boxSizing: "border-box",
                }}
                className="p-8px"
              >
                <Typography.Text bold color={item.color}>
                  {item.label}
                </Typography.Text>
                {item.value.map((v) => (
                  <div key={v}>
                    <Typography.Text style={{ wordBreak: "unset", color: item.color }}>{v}</Typography.Text>
                  </div>
                ))}
              </Grid.Col>
            ))}
          </Grid.Row>
        </Grid.Col>
      </Grid.Row>
      <div id="show-code-container">
        <CodeEditor
          id="show-code"
          code={scriptCode || undefined}
          diffCode={diffCode === scriptCode ? "" : diffCode || ""}
        />
      </div>
    </div>
  );
}

export default App;

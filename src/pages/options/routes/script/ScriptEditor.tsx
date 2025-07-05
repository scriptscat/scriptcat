import { Script, SCRIPT_TYPE_NORMAL, ScriptCodeDAO, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { editor, KeyCode, KeyMod } from "monaco-editor";
import { Button, Dropdown, Grid, Input, Menu, Message, Modal, Tabs, Tooltip } from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";
import "./index.css";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import ScriptStorage from "@App/pages/components/ScriptStorage";
import ScriptResource from "@App/pages/components/ScriptResource";
import ScriptSetting from "@App/pages/components/ScriptSetting";
import { runtimeClient, scriptClient } from "@App/pages/store/features/script";
import i18n, { i18nName } from "@App/locales/locales";
import { useTranslation } from "react-i18next";
import { IconDelete, IconSearch } from "@arco-design/web-react/icon";

const { Row } = Grid;
const { Col } = Grid;

type HotKey = {
  id: string;
  title: string;
  hotKey: number;
  action: (script: Script, codeEditor: editor.IStandaloneCodeEditor) => void;
};

const Editor: React.FC<{
  id: string;
  script: Script;
  code: string;
  hotKeys: HotKey[];
  callbackEditor: (e: editor.IStandaloneCodeEditor) => void;
  onChange: (code: string) => void;
}> = ({ id, script, code, hotKeys, callbackEditor, onChange }) => {
  const [node, setNode] = useState<{ editor: editor.IStandaloneCodeEditor }>();
  const ref = useCallback<(node: { editor: editor.IStandaloneCodeEditor }) => void>(
    (inlineNode) => {
      if (inlineNode && inlineNode.editor && !node) {
        setNode(inlineNode);
      }
    },
    [node]
  );
  useEffect(() => {
    if (!node || !node.editor) {
      return;
    }
    // @ts-ignore
    if (!node.editor.uuid) {
      // @ts-ignore
      node.editor.uuid = script.uuid;
    }
    //@ts-ignore
    console.log(node.editor.uuid);
    hotKeys.forEach((item) => {
      node.editor.addAction({
        id: item.id,
        label: item.title,
        keybindings: [item.hotKey],
        run(editor) {
          // @ts-ignore
          item.action(script, editor);
        },
      });
    });
    node.editor.onKeyUp(() => {
      onChange(node.editor.getValue() || "");
    });
    callbackEditor(node.editor);
    return () => {
      node.editor.dispose();
    };
  }, [node?.editor]);

  return <CodeEditor key={id} id={id} ref={ref} code={code} diffCode="" editable />;
};

const WarpEditor = React.memo(Editor, (prev, next) => {
  return prev.script.uuid === next.script.uuid;
});

type EditorMenu = {
  title: string;
  tooltip?: string;
  action?: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  items?: {
    id: string;
    title: string;
    tooltip?: string;
    hotKey?: number;
    hotKeyString?: string;
    action: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  }[];
};

const emptyScript = async (template: string, hotKeys: any, target?: string) => {
  let code = "";
  switch (template) {
    case "background":
      code = backgroundTpl;
      break;
    case "crontab":
      code = crontabTpl;
      break;
    default:
      code = normalTpl;
      if (target === "initial") {
        const url = await new Promise<string>((resolve) => {
          chrome.storage.local.get(["activeTabUrl"], (result) => {
            chrome.storage.local.remove(["activeTabUrl"]);
            if (result.activeTabUrl) {
              resolve(result.activeTabUrl.url);
            } else {
              resolve("undefind");
            }
          });
        });
        code = code.replace("{{match}}", url);
      }
      break;
  }
  const prepareScript = await prepareScriptByCode(code, "", uuidv4());
  const { script } = prepareScript;

  return ({
    script,
    code,
    active: true,
    hotKeys,
    isChanged: false,
  });
};

type visibleItem = "scriptStorage" | "scriptSetting" | "scriptResource";

const popstate = () => {
  // eslint-disable-next-line no-restricted-globals, no-alert
  if (confirm(i18n.t("script_modified_leave_confirm"))) {
    window.history.back();
    window.removeEventListener("popstate", popstate);
  } else {
    window.history.pushState(null, "", window.location.href);
  }
  return false;
};

function ScriptEditor() {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);
  const [editors, setEditors] = useState<
    {
      script: Script;
      code: string;
      active: boolean;
      hotKeys: HotKey[];
      editor?: editor.IStandaloneCodeEditor;
      isChanged: boolean;
    }[]
  >([]);
  const [scriptList, setScriptList] = useState<Script[]>([]);
  const [currentScript, setCurrentScript] = useState<Script>();
  const [selectSciptButtonAndTab, setSelectSciptButtonAndTab] = useState<string>("");
  const [rightOperationTab, setRightOperationTab] = useState<{
    key: string;
    uuid: string;
    selectSciptButtonAndTab: string;
  }>();
  const { uuid } = useParams();
  const { t } = useTranslation();
  const template = useSearchParams()[0].get("template") || "";
  const target = useSearchParams()[0].get("target") || "";
  const scriptDAO = new ScriptDAO();
  const scriptCodeDAO = new ScriptCodeDAO();

  const setShow = (key: visibleItem, show: boolean) => {
    Object.keys(visible).forEach((k) => {
      visible[k] = false;
    });
    visible[key] = show;
    setVisible({ ...visible });
  };

  const save = (script: Script, e: editor.IStandaloneCodeEditor): Promise<Script> => {
    // 解析code生成新的script并更新
    return prepareScriptByCode(e.getValue(), script.origin || "", script.uuid)
      .then((prepareScript) => {
        const newScript = prepareScript.script;
        if (!newScript.name) {
          Message.warning(t("script_name_cannot_be_set_to_empty"));
          return Promise.reject(new Error("script name cannot be empty"));
        }
        return scriptClient
          .install(newScript, e.getValue())
          .then((update): Script => {
            if (!update) {
              Message.success(t("create_success_note"));
              // 保存的时候如何左侧没有脚本即新建
              setScriptList((prev) => {
                setSelectSciptButtonAndTab(newScript.uuid);
                return [newScript, ...prev];
              });
            } else {
              setScriptList((prev) => {
                prev.map((script: Script) => {
                  if (script.uuid === newScript.uuid) {
                    script.name = newScript.name;
                  }
                });
                return [...prev];
              });
              Message.success(t("save_success"));
            }
            setEditors((prev) => {
              for (let i = 0; i < prev.length; i += 1) {
                if (prev[i].script.uuid === newScript.uuid) {
                  prev[i].code = e.getValue();
                  prev[i].isChanged = false;
                  prev[i].script.name = newScript.name;
                  break;
                }
              }
              return [...prev];
            });
            return newScript;
          })
          .catch((err: any) => {
            Message.error(`${t("save_failed")}: ${err}`);
            return Promise.reject(err);
          });
      })
      .catch((err) => {
        Message.error(`${t("invalid_script_code")}: ${err}`);
        return Promise.reject(err);
      });
  };

  const saveAs = (script: Script, e: editor.IStandaloneCodeEditor) => {
    return new Promise<void>((resolve) => {
      chrome.downloads.download(
        {
          url: URL.createObjectURL(new Blob([e.getValue()], { type: "text/javascript" })),
          saveAs: true, // true直接弹出对话框；false弹出下载选项
          filename: `${script.name}.user.js`,
        },
        () => {
          /*
            chrome扩展api发生错误无法通过try/catch捕获，必须在api回调函数中访问chrome.runtime.lastError进行获取
            var chrome.runtime.lastError: chrome.runtime.LastError | undefined
            This will be defined during an API method callback if there was an error
          */
          if (chrome.runtime.lastError) {
            // eslint-disable-next-line no-console
            console.log(t("save_as_failed") + ": ", chrome.runtime.lastError);
            Message.error(`${t("save_as_failed")}: ${chrome.runtime.lastError.message}`);
          } else {
            Message.success(t("save_as_success"));
          }
          resolve();
        }
      );
    });
  };
  const menu: EditorMenu[] = [
    {
      title: t("file"),
      items: [
        {
          id: "save",
          title: t("save"),
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          hotKeyString: "Ctrl+S",
          action: save,
        },
        {
          id: "saveAs",
          title: t("save_as"),
          hotKey: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
          hotKeyString: "Ctrl+Shift+S",
          action: saveAs,
        },
      ],
    },
    {
      title: t("run"),
      items: [
        {
          id: "run",
          title: t("run"),
          hotKey: KeyMod.CtrlCmd | KeyCode.F5,
          hotKeyString: "Ctrl+F5",
          tooltip: t("only_background_scheduled_can_run"),
          action: async (script, e) => {
            // 保存更新代码之后再调试
            const newScript = await save(script, e);
            // 判断脚本类型
            if (newScript.type === SCRIPT_TYPE_NORMAL) {
              Message.error(t("only_background_scheduled_can_run"));
              return;
            }
            Message.loading({
              id: "debug_script",
              content: t("preparing_script_resources"),
              duration: 3000,
            });
            runtimeClient
              .runScript(newScript.uuid)
              .then(() => {
                Message.success({
                  id: "debug_script",
                  content: t("build_success_message"),
                  duration: 3000,
                });
              })
              .catch((err) => {
                LoggerCore.logger(Logger.E(err)).debug("run script error");
                Message.error({
                  id: "debug_script",
                  content: `${t("build_failed")}: ${err}`,
                  duration: 3000,
                });
              });
          },
        },
      ],
    },
    {
      title: t("tools"),
      items: [
        {
          id: "scriptStorage",
          title: t("script_storage"),
          tooltip: t("script_storage_tooltip"),
          action(script) {
            setShow("scriptStorage", true);
            setCurrentScript(script);
          },
        },
        {
          id: "scriptResource",
          title: t("script_resource"),
          tooltip: t("script_resource_tooltip"),
          action(script) {
            setShow("scriptResource", true);
            setCurrentScript(script);
          },
        },
      ],
    },
    {
      title: t("settings"),
      tooltip: t("script_setting_tooltip"),
      action(script) {
        setShow("scriptSetting", true);
        setCurrentScript(script);
      },
    },
  ];

  // 根据菜单生产快捷键
  const hotKeys: HotKey[] = [];
  let activeTab = "";
  for (let i = 0; i < editors.length; i += 1) {
    if (editors[i].active) {
      activeTab = i.toString();
      break;
    }
  }
  menu.forEach((item) => {
    item.items &&
      item.items.forEach((menuItem) => {
        if (menuItem.hotKey) {
          hotKeys.push({
            id: menuItem.id,
            title: menuItem.title,
            hotKey: menuItem.hotKey,
            action: menuItem.action,
          });
        }
      });
  });
  useEffect(() => {
    scriptDAO.all().then(async (scripts) => {
      setScriptList(scripts.sort((a, b) => a.sort - b.sort));
      // 如果有id则打开对应的脚本
      if (uuid) {
        for (let i = 0; i < scripts.length; i += 1) {
          if (scripts[i].uuid === uuid) {
            // 如果已经打开则激活
            scriptCodeDAO.findByUUID(uuid).then((code) => {
              setEditors((prev) => {
                const flag = prev.some((item) => item.script.uuid === scripts[i].uuid);
                if (flag) {
                  return prev.map((item) => {
                    if (item.script.uuid === scripts[i].uuid) {
                      item.active = true;
                    } else {
                      item.active = false;
                    }
                    return item;
                  });
                }
                prev.push({
                  script: scripts[i],
                  code: code?.code || "",
                  active: true,
                  hotKeys,
                  isChanged: false,
                });
                return prev;
              });
              setSelectSciptButtonAndTab(scripts[i].uuid);
            });
            break;
          }
        }
      } else {
        emptyScript(template || "", hotKeys, target).then((e) => {
          editors.push(e);
          setEditors([...editors]);
        });
      }
    });
    // 恢复标题
    return () => {
      document.title = "Home - ScriptCat";
    };
  }, []);

  // 控制onbeforeunload
  useEffect(() => {
    let flag = false;

    for (let i = 0; i < editors.length; i += 1) {
      if (editors[i].isChanged) {
        flag = true;
        break;
      }
    }

    if (flag) {
      const beforeunload = () => {
        return true;
      };
      window.onbeforeunload = beforeunload;
      window.history.pushState(null, "", window.location.href);
      window.addEventListener("popstate", popstate);
    } else {
      window.removeEventListener("popstate", popstate);
    }

    return () => {
      window.onbeforeunload = null;
    };
  }, [editors]);

  // 对tab点击右键进行的操作
  useEffect(() => {
    let newEditors = [];
    let selectEditorIndex: number = 0;
    // 1 关闭当前, 2关闭其它, 3关闭左侧, 4关闭右侧
    if (rightOperationTab) {
      // eslint-disable-next-line default-case
      switch (rightOperationTab.key) {
        case "1":
          newEditors = editors.filter((item) => item.script.uuid !== rightOperationTab.uuid);
          if (newEditors.length > 0) {
            // 还有的话，如果之前有选中的，那么我们还是选中之前的，如果没有选中的我们就选中第一个
            if (rightOperationTab.selectSciptButtonAndTab === rightOperationTab.uuid) {
              if (newEditors.length > 0) {
                newEditors[0].active = true;
                setSelectSciptButtonAndTab(newEditors[0].script.uuid);
              }
            } else {
              setSelectSciptButtonAndTab(rightOperationTab.selectSciptButtonAndTab);
              // 之前选中的tab
              editors.filter((item) => {
                if (item.script.uuid === rightOperationTab.selectSciptButtonAndTab) {
                  item.active = true;
                } else {
                  item.active = false;
                }
                return item.script.uuid === rightOperationTab.selectSciptButtonAndTab;
              });
            }
          }
          setEditors([...newEditors]);
          break;
        case "2":
          newEditors = editors.filter((item) => item.script.uuid === rightOperationTab.uuid);
          setSelectSciptButtonAndTab(rightOperationTab.uuid);
          setEditors([...newEditors]);
          break;
        case "3":
          editors.map((item, index) => {
            if (item.script.uuid === rightOperationTab.uuid) {
              selectEditorIndex = index;
            }
            return null;
          });
          newEditors = editors.splice(selectEditorIndex);
          setEditors([...newEditors]);
          break;
        case "4":
          editors.map((item, index) => {
            if (item.script.uuid === rightOperationTab.uuid) {
              selectEditorIndex = index;
            }
            return null;
          });
          newEditors = editors.splice(0, selectEditorIndex + 1);
          setEditors([...newEditors]);
      }
    }
  }, [rightOperationTab]);

  // 通用的编辑器删除处理函数
  const handleDeleteEditor = (targetUuid: string, needConfirm: boolean = false) => {
    setEditors((prev) => {
      const targetIndex = prev.findIndex((e) => e.script.uuid === targetUuid);
      if (targetIndex === -1) return prev;

      const targetEditor = prev[targetIndex];

      // 如果需要确认且脚本已修改
      if (needConfirm && targetEditor.isChanged) {
        if (!confirm(t("script_modified_close_confirm"))) {
          return prev;
        }
      }

      // 如果只剩一个编辑器，打开空白脚本
      if (prev.length === 1) {
        emptyScript(template || "", hotKeys).then((e) => {
          setEditors([e]);
          setSelectSciptButtonAndTab(e.script.uuid);
        });
        return prev;
      }

      // 删除目标编辑器
      const newEditors = prev.filter((_, index) => index !== targetIndex);

      // 如果删除的是当前激活的编辑器，需要激活其他编辑器
      if (targetEditor.active && newEditors.length > 0) {
        let nextActiveIndex;
        if (targetIndex >= newEditors.length) {
          // 如果删除的是最后一个，激活前一个
          nextActiveIndex = newEditors.length - 1;
        } else {
          // 否则激活下一个（原来的下一个现在在同样的位置）
          nextActiveIndex = targetIndex;
        }
        newEditors[nextActiveIndex].active = true;
        setSelectSciptButtonAndTab(newEditors[nextActiveIndex].script.uuid);
      }

      return newEditors;
    });
  };

  // 处理编辑器激活状态变化时的focus
  useEffect(() => {
    editors.forEach((item) => {
      if (item.active && item.editor) {
        setTimeout(() => {
          item.editor?.focus();
        }, 100);
      }
    });
  }, [activeTab]); // 只在activeTab变化时执行

  return (
    <div
      className="h-full flex flex-col"
      style={{
        position: "relative",
        left: -10,
        top: -10,
        width: "calc(100% + 20px)",
        height: "calc(100% + 20px)",
      }}
    >
      <ScriptStorage
        visible={visible.scriptStorage}
        script={currentScript}
        onOk={() => {
          setShow("scriptStorage", false);
        }}
        onCancel={() => {
          setShow("scriptStorage", false);
        }}
      />
      <ScriptResource
        visible={visible.scriptResource}
        script={currentScript}
        onOk={() => {
          setShow("scriptResource", false);
        }}
        onCancel={() => {
          setShow("scriptResource", false);
        }}
      />
      <ScriptSetting
        visible={visible.scriptSetting}
        script={currentScript!}
        onOk={() => {
          setShow("scriptSetting", false);
        }}
        onCancel={() => {
          setShow("scriptSetting", false);
        }}
      />
      <div
        className="h-6"
        style={{
          borderBottom: "1px solid var(--color-neutral-3)",
          background: "var(--color-secondary)",
        }}
      >
        <div className="flex flex-row">
          {menu.map((item, index) => {
            if (!item.items) {
              // 没有子菜单
              return (
                <Button
                  key={`m_${item.title}`}
                  size="mini"
                  onClick={() => {
                    setEditors((prev) => {
                      prev.forEach((e) => {
                        if (e.active) {
                          item.action && item.action(e.script, e.editor!);
                        }
                      });
                      return prev;
                    });
                  }}
                >
                  {item.title}
                </Button>
              );
            }
            return (
              <Dropdown
                key={`d_${index.toString()}`}
                droplist={
                  <Menu
                    style={{
                      padding: "0",
                      margin: "0",
                      borderRadius: "0",
                    }}
                  >
                    {item.items.map((menuItem, i) => {
                      const btn = (
                        <Button
                          style={{
                            width: "100%",
                            textAlign: "left",
                            alignSelf: "center",
                            verticalAlign: "middle",
                          }}
                          key={`sm_${menuItem.title}`}
                          size="mini"
                          onClick={() => {
                            setEditors((prev) => {
                              prev.forEach((e) => {
                                if (e.active) {
                                  menuItem.action(e.script, e.editor!);
                                }
                              });
                              return prev;
                            });
                          }}
                        >
                          <div
                            style={{
                              minWidth: "70px",
                              float: "left",
                              fontSize: "14px",
                            }}
                          >
                            {menuItem.title}
                          </div>
                          <div
                            style={{
                              minWidth: "50px",
                              float: "left",
                              color: "rgb(165 165 165)",
                              fontSize: "12px",
                              lineHeight: "22px", // 不知道除此以外怎么垂直居中
                            }}
                          >
                            {menuItem.hotKeyString}
                          </div>
                        </Button>
                      );
                      return (
                        <Menu.Item
                          key={`m_${i.toString()}`}
                          style={{
                            height: "unset",
                            padding: "0",
                            lineHeight: "unset",
                          }}
                        >
                          {menuItem.tooltip ? (
                            <Tooltip key={`m${i.toString()}`} position="right" content={menuItem.tooltip}>
                              {btn}
                            </Tooltip>
                          ) : (
                            btn
                          )}
                        </Menu.Item>
                      );
                    })}
                  </Menu>
                }
                trigger="click"
                position="bl"
              >
                <Button key={`m_${item.title}`} size="mini">
                  {item.title}
                </Button>
              </Dropdown>
            );
          })}
        </div>
      </div>
      <Row
        className="flex flex-grow flex-1"
        style={{
          overflow: "hidden",
        }}
      >
        <Col
          span={4}
          className="h-full"
          style={{
            overflow: "scroll",
          }}
        >
          <div
            className="flex flex-col"
            style={{
              backgroundColor: "var(--color-secondary)",
              overflow: "hidden",
            }}
          >
            <Button
              className="text-left"
              size="mini"
              style={{
                color: "var(--color-text-2)",
              }}
            >
              <div className="flex justify-between items-center">
                {t("installed_scripts")}
                <IconSearch
                  onClick={(e) => {
                    setShowSearchInput(!showSearchInput);
                  }}
                  style={{ cursor: "pointer" }}
                />
              </div>
            </Button>
            {showSearchInput && (
              <div className="p-2">
                <Input
                  placeholder={t("search_scripts")}
                  allowClear
                  value={searchKeyword}
                  onChange={(value) => setSearchKeyword(value)}
                  size="mini"
                />
              </div>
            )}
            {scriptList
              .filter((script) => {
                if (!searchKeyword) return true;
                return i18nName(script).toLowerCase().includes(searchKeyword.toLowerCase());
              })
              .map((script) => (
                <div
                  key={`s_${script.uuid}`}
                  className="relative group"
                  style={{
                    overflow: "hidden",
                  }}
                >
                  <Button
                    size="mini"
                    className="text-left w-full"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      backgroundColor: selectSciptButtonAndTab === script.uuid ? "gray" : "",
                      paddingRight: "32px", // 为删除按钮留出空间
                    }}
                    onClick={() => {
                      setSelectSciptButtonAndTab(script.uuid);
                      // 如果已经打开则激活
                      let flag = false;
                      for (let i = 0; i < editors.length; i += 1) {
                        if (editors[i].script.uuid === script.uuid) {
                          editors[i].active = true;
                          flag = true;
                        } else {
                          editors[i].active = false;
                        }
                      }
                      if (!flag) {
                        // 如果没有打开则打开
                        // 获取code
                        scriptCodeDAO.findByUUID(script.uuid).then((code) => {
                          if (!code) {
                            return;
                          }
                          editors.push({
                            script,
                            code: code.code,
                            active: true,
                            hotKeys,
                            isChanged: false,
                          });
                          setEditors([...editors]);
                        });
                      }
                    }}
                  >
                    <span className="overflow-hidden text-ellipsis">{i18nName(script)}</span>
                  </Button>
                  {/* 删除按钮，只在鼠标悬停时显示 */}
                  <Button
                    type="text"
                    icon={<IconDelete />}
                    iconOnly
                    size="mini"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      width: "20px",
                      height: "20px",
                      minWidth: "20px",
                      border: "none",
                      background: "transparent",
                      color: "var(--color-text-2)",
                      boxShadow: "none",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 删除脚本
                      Modal.confirm({
                        title: t("confirm_delete_script"),
                        content: t("confirm_delete_script_content", { name: i18nName(script) }),
                        onOk: () => {
                          scriptClient
                            .delete(script.uuid)
                            .then(() => {
                              setScriptList((prev) => prev.filter((s) => s.uuid !== script.uuid));
                              handleDeleteEditor(script.uuid);
                              if (selectSciptButtonAndTab === script.uuid) {
                                setSelectSciptButtonAndTab("");
                              }
                              Message.success(t("delete_success"));
                            })
                            .catch((err) => {
                              LoggerCore.logger(Logger.E(err)).debug("delete script error");
                              Message.error(`${t("delete_failed")}: ${err}`);
                            });
                        },
                      });
                    }}
                  />
                </div>
              ))}
          </div>
        </Col>
        <Col span={20} className="flex! flex-col h-full">
          <Tabs
            editable
            activeTab={activeTab}
            className="edit-tabs"
            type="card-gutter"
            style={{
              overflow: "inherit",
            }}
            onChange={(index: string) => {
              editors.forEach((_, i) => {
                if (i.toString() === index) {
                  setSelectSciptButtonAndTab(editors[i].script.uuid);
                  editors[i].active = true;
                } else {
                  editors[i].active = false;
                }
                setEditors([...editors]);
              });
            }}
            onAddTab={() => {
              emptyScript(template || "", hotKeys).then((e) => {
                setEditors((prev) => {
                  prev.forEach((item) => {
                    item.active = false;
                  });
                  setSelectSciptButtonAndTab(e.script.uuid);
                  prev.push(e);
                  return [...prev];
                });
              });
            }}
            onDeleteTab={(index: string) => {
              const i = parseInt(index, 10);
              const targetUuid = editors[i]?.script.uuid;
              if (targetUuid) {
                handleDeleteEditor(targetUuid, true);
              }
            }}
          >
            {editors.map((e, index) => (
              <TabPane
                destroyOnHide
                key={index!.toString()}
                title={
                  <Dropdown
                    trigger="contextMenu"
                    position="bl"
                    droplist={
                      <Menu
                        // eslint-disable-next-line no-shadow
                        onClickMenuItem={(key) => {
                          setRightOperationTab({
                            ...rightOperationTab,
                            key,
                            uuid: e.script.uuid,
                            selectSciptButtonAndTab,
                          });
                        }}
                      >
                        <Menu.Item key="1">{t("close_current_tab")}</Menu.Item>
                        <Menu.Item key="2">{t("close_other_tabs")}</Menu.Item>
                        <Menu.Item key="3">{t("close_left_tabs")}</Menu.Item>
                        <Menu.Item key="4">{t("close_right_tabs")}</Menu.Item>
                      </Menu>
                    }
                  >
                    <span
                      style={{
                        // eslint-disable-next-line no-nested-ternary
                        color: e.isChanged
                          ? "rgb(var(--orange-5))" // eslint-disable-next-line no-nested-ternary
                          : e.script.uuid === selectSciptButtonAndTab
                            ? "rgb(var(--green-7))"
                            : e.active
                              ? "rgb(var(--green-7))"
                              : "var(--color-text-1)",
                      }}
                    >
                      {e.script.name}
                    </span>
                  </Dropdown>
                }
              />
            ))}
          </Tabs>
          <div className="flex flex-grow flex-1">
            {editors.map((item) => {
              if (item.active) {
                document.title = `${i18nName(item.script)} - Script Editor`;
              }
              return (
                <div
                  className="w-full"
                  key={`fe_${item.script.uuid}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <WarpEditor
                    key={`e_${item.script.uuid}`}
                    id={`e_${item.script.uuid}`}
                    script={item.script}
                    code={item.code}
                    hotKeys={item.hotKeys}
                    callbackEditor={(e) => {
                      setEditors((prev) => {
                        prev.forEach((v) => {
                          if (v.script.uuid === item.script.uuid) {
                            v.editor = e;
                            // 编辑器实例创建后立即聚焦一次
                            if (v.active) {
                              setTimeout(() => e.focus(), 100);
                            }
                          }
                        });
                        return [...prev];
                      });
                    }}
                    onChange={(code) => {
                      const isChanged = !(item.code === code);
                      if (isChanged !== item.isChanged) {
                        setEditors((prev) => {
                          prev.forEach((v) => {
                            if (v.script.uuid === item.script.uuid) {
                              v.isChanged = isChanged;
                            }
                          });
                          return [...prev];
                        });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Col>
      </Row>
    </div>
  );
}

export default ScriptEditor;

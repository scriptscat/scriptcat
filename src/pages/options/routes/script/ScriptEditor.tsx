import { Script, ScriptDAO } from "@App/app/repo/scripts";
import CodeEditor from "@App/pages/components/CodeEditor";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { editor, KeyCode, KeyMod } from "monaco-editor";
import {
  Button,
  Dropdown,
  Grid,
  Menu,
  Message,
  Tabs,
  Tooltip,
} from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import ScriptController from "@App/app/service/script/controller";
import normalTpl from "@App/template/normal.tpl";
import crontabTpl from "@App/template/crontab.tpl";
import backgroundTpl from "@App/template/background.tpl";
import { v4 as uuidv4 } from "uuid";
import "./index.css";
import IoC from "@App/app/ioc";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";
import { prepareScriptByCode } from "@App/pkg/utils/script";
import RuntimeController from "@App/runtime/content/runtime";
import ScriptStorage from "@App/pages/components/ScriptStorage";
import ScriptResource from "@App/pages/components/ScriptResource";
import ScriptSetting from "@App/pages/components/ScriptSetting";

const { Row } = Grid;
const { Col } = Grid;

// 声明一个Map存储Script
const ScriptMap = new Map();

type HotKey = {
  hotKey: number;
  action: (script: Script, codeEditor: editor.IStandaloneCodeEditor) => void;
};

const Editor: React.FC<{
  id: string;
  script: Script;
  hotKeys: HotKey[];
  callbackEditor: (e: editor.IStandaloneCodeEditor) => void;
  onChange: (code: string) => void;
}> = ({ id, script, hotKeys, callbackEditor, onChange }) => {
  const [init, setInit] = useState(false);
  const codeEditor = useRef<{ editor: editor.IStandaloneCodeEditor }>(null);
  // Script.uuid为key，Script为value，储存Script
  ScriptMap.has(script.uuid) || ScriptMap.set(script.uuid, script);
  useEffect(() => {
    if (!codeEditor.current || !codeEditor.current.editor) {
      setTimeout(() => {
        setInit(true);
      }, 200);
      return () => {};
    }
    // 初始化editor时将Script的uuid绑定到editor上
    // @ts-ignore
    if (!codeEditor.current.editor.uuid) {
      // @ts-ignore
      codeEditor.current.editor.uuid = script.uuid;
    }
    hotKeys.forEach((item) => {
      codeEditor.current?.editor.addCommand(item.hotKey, () => {
        // 获取当前激活的editor（通过editor._focusTracker._hasFocus判断editor激活状态 可能有更好的方法）
        const activeEditor = editor
          .getEditors()
          // @ts-ignore
          // eslint-disable-next-line no-underscore-dangle
          .find((i) => i._focusTracker._hasFocus);

        // 仅在获取到激活的editor时，通过editor上绑定的uuid获取Script，并指定激活的editor执行快捷键action
        activeEditor &&
          // @ts-ignore
          item.action(ScriptMap.get(activeEditor.uuid), activeEditor);
      });
    });
    codeEditor.current.editor.onKeyUp(() => {
      onChange(codeEditor.current?.editor.getValue() || "");
    });
    callbackEditor(codeEditor.current.editor);
    return () => {};
  }, [init]);

  return (
    <CodeEditor
      id={id}
      ref={codeEditor}
      code={script.code}
      diffCode=""
      editable
    />
  );
};

type EditorMenu = {
  title: string;
  tooltip?: string;
  action?: (script: Script, e: editor.IStandaloneCodeEditor) => void;
  items?: {
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

  return Promise.resolve({
    script,
    code: script.code,
    active: true,
    hotKeys,
    isChanged: false,
  });
};

type visibleItem = "scriptStorage" | "scriptSetting" | "scriptResource";

const popstate = () => {
  // eslint-disable-next-line no-restricted-globals, no-alert
  if (confirm("脚本已修改, 离开后会丢失修改, 是否继续?")) {
    window.history.back();
    window.removeEventListener("popstate", popstate);
  } else {
    window.history.pushState(null, "", window.location.href);
  }
  return false;
};

function ScriptEditor() {
  const scriptDAO = new ScriptDAO();
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const runtimeCtrl = IoC.instance(RuntimeController) as RuntimeController;
  const template = useSearchParams()[0].get("template") || "";
  const target = useSearchParams()[0].get("target") || "";
  const navigate = useNavigate();
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});
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
  const [selectSciptButtonAndTab, setSelectSciptButtonAndTab] =
    useState<string>("");
  const [rightOperationTab, setRightOperationTab] = useState<{
    key: string;
    uuid: string;
    selectSciptButtonAndTab: string;
  }>();
  const setShow = (key: visibleItem, show: boolean) => {
    Object.keys(visible).forEach((k) => {
      visible[k] = false;
    });
    visible[key] = show;
    setVisible({ ...visible });
  };

  const { id } = useParams();
  const save = (
    script: Script,
    e: editor.IStandaloneCodeEditor
  ): Promise<Script> => {
    // 解析code生成新的script并更新
    return new Promise((resolve) => {
      prepareScriptByCode(e.getValue(), script.origin || "", script.uuid)
        .then((prepareScript) => {
          const newScript = prepareScript.script;
          scriptCtrl.upsert(newScript).then(
            () => {
              if (!newScript.name) {
                Message.warning("脚本name不可以设置为空");
                return;
              }
              if (newScript.id === 0) {
                Message.success("新建成功,请注意后台脚本不会默认开启");
                // 保存的时候如何左侧没有脚本即新建
                setScriptList((prev) => {
                  setSelectSciptButtonAndTab(newScript.uuid);
                  return [newScript, ...prev];
                });
              } else {
                setScriptList((prev) => {
                  // eslint-disable-next-line no-shadow, array-callback-return
                  prev.map((script: Script) => {
                    if (script.uuid === newScript.uuid) {
                      script.name = newScript.name;
                    }
                  });
                  return [...prev];
                });
                Message.success("保存成功");
              }
              setEditors((prev) => {
                for (let i = 0; i < prev.length; i += 1) {
                  if (prev[i].script.uuid === newScript.uuid) {
                    prev[i].code = newScript.code;
                    prev[i].isChanged = false;
                    prev[i].script.name = newScript.name;
                    break;
                  }
                }
                resolve(newScript);
                return [...prev];
              });
            },
            (err) => {
              Message.error(`保存失败: ${err}`);
            }
          );
        })
        .catch((err) => {
          Message.error(`错误的脚本代码: ${err}`);
        });
    });
  };
  const saveAs = (script: Script, e: editor.IStandaloneCodeEditor) => {
    return new Promise<void>((resolve) => {
      chrome.downloads.download(
        {
          url: URL.createObjectURL(
            new Blob([e.getValue()], { type: "text/javascript" })
          ),
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
            console.log("另存为失败: ", chrome.runtime.lastError);
            Message.error(`另存为失败: ${chrome.runtime.lastError.message}`);
          } else {
            Message.success("另存为成功");
          }
          resolve();
        }
      );
    });
  };
  const menu: EditorMenu[] = [
    {
      title: "文件",
      items: [
        {
          title: "保存",
          hotKey: KeyMod.CtrlCmd | KeyCode.KeyS,
          hotKeyString: "Ctrl+S",
          action: save,
        },
        {
          title: "另存为",
          hotKey: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyS,
          hotKeyString: "Ctrl+Shift+S",
          action: saveAs,
        },
      ],
    },
    {
      title: "运行",
      items: [
        {
          title: "调试",
          hotKey: KeyMod.CtrlCmd | KeyCode.F5,
          hotKeyString: "Ctrl+F5",
          tooltip:
            "只有后台脚本/定时脚本才能调试, 且调试模式下不对进行权限校验(例如@connect)",
          action: async (script, e) => {
            // 保存更新代码之后再调试
            const newScript = await save(script, e);
            Message.loading({
              id: "debug_script",
              content: "正在准备脚本资源...",
              duration: 3000,
            });
            runtimeCtrl
              .debugScript(newScript)
              .then(() => {
                Message.success({
                  id: "debug_script",
                  content: "构建成功, 可以打开开发者工具在控制台中查看输出",
                  duration: 3000,
                });
              })
              .catch((err) => {
                LoggerCore.getLogger(Logger.E(err)).debug("debug script error");
                Message.error({
                  id: "debug_script",
                  content: `构建失败: ${err}`,
                  duration: 3000,
                });
              });
          },
        },
      ],
    },
    {
      title: "工具",
      items: [
        {
          title: "脚本储存",
          tooltip: "可以管理脚本GM_value的储存数据",
          action(script) {
            setShow("scriptStorage", true);
            setCurrentScript(script);
          },
        },
        {
          title: "脚本资源",
          tooltip: "管理@resource,@require下载的资源",
          action(script) {
            setShow("scriptResource", true);
            setCurrentScript(script);
          },
        },
      ],
    },
    {
      title: "设置",
      tooltip: "对脚本进行一些自定义设置",
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
            hotKey: menuItem.hotKey,
            action: menuItem.action,
          });
        }
      });
  });
  useEffect(() => {
    scriptDAO.table
      .orderBy("sort")
      .toArray()
      .then((scripts) => {
        setScriptList(scripts);
        // 如果有id则打开对应的脚本
        if (id) {
          const iId = parseInt(id, 10);
          for (let i = 0; i < scripts.length; i += 1) {
            if (scripts[i].id === iId) {
              editors.push({
                script: scripts[i],
                code: scripts[i].code,
                active: true,
                hotKeys,
                isChanged: false,
              });
              setSelectSciptButtonAndTab(scripts[i].uuid);
              setEditors([...editors]);
              break;
            }
          }
        }
      });
    if (!id) {
      emptyScript(template || "", hotKeys, target).then((e) => {
        editors.push(e);
        setEditors([...editors]);
      });
    }
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
          newEditors = editors.filter(
            (item) => item.script.uuid !== rightOperationTab.uuid
          );
          if (newEditors.length > 0) {
            // 还有的话，如果之前有选中的，那么我们还是选中之前的，如果没有选中的我们就选中第一个
            if (
              rightOperationTab.selectSciptButtonAndTab ===
              rightOperationTab.uuid
            ) {
              if (newEditors.length > 0) {
                newEditors[0].active = true;
                setSelectSciptButtonAndTab(newEditors[0].script.uuid);
              }
            } else {
              setSelectSciptButtonAndTab(
                rightOperationTab.selectSciptButtonAndTab
              );
              // 之前选中的tab
              editors.filter((item) => {
                if (
                  item.script.uuid === rightOperationTab.selectSciptButtonAndTab
                ) {
                  item.active = true;
                } else {
                  item.active = false;
                }
                return (
                  item.script.uuid === rightOperationTab.selectSciptButtonAndTab
                );
              });
            }
          }
          setEditors([...newEditors]);
          break;
        case "2":
          newEditors = editors.filter(
            (item) => item.script.uuid === rightOperationTab.uuid
          );
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
                            <Tooltip
                              key={`m${i.toString()}`}
                              position="right"
                              content={menuItem.tooltip}
                            >
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
              disabled
              style={{
                color: "var(--color-text-2)",
              }}
            >
              已安装脚本
            </Button>
            {scriptList.map((script) => (
              <Button
                key={`s_${script.uuid}`}
                size="mini"
                className="text-left"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  backgroundColor:
                    selectSciptButtonAndTab === script.uuid ? "gray" : "",
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
                    editors.push({
                      script,
                      code: script.code,
                      active: true,
                      hotKeys,
                      isChanged: false,
                    });
                  }
                  setEditors([...editors]);
                }}
              >
                {script.name}
              </Button>
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
              // 处理删除
              setEditors((prev) => {
                const i = parseInt(index, 10);
                if (prev[i].isChanged) {
                  // eslint-disable-next-line no-restricted-globals, no-alert
                  if (!confirm("脚本已修改, 关闭后会丢失修改, 是否继续?")) {
                    return prev;
                  }
                }
                if (prev.length === 1) {
                  // 如果是id打开的回退到列表
                  if (id) {
                    navigate("/");
                    return prev;
                  }
                  // 如果没有打开的了, 则打开一个空白的
                  emptyScript(template || "", hotKeys).then((e) => {
                    setEditors([e]);
                  });
                  return prev;
                }
                if (prev[i].active) {
                  // 如果关闭的是当前激活的, 则激活下一个
                  if (i === prev.length - 1) {
                    prev[i - 1].active = true;
                    setSelectSciptButtonAndTab(prev[i - 1].script.uuid);
                  } else {
                    prev[i + 1].active = true;
                    setSelectSciptButtonAndTab(prev[i - 1].script.uuid);
                  }
                }
                prev.splice(i, 1);
                return [...prev];
              });
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
                        <Menu.Item key="1">关闭当前标签页</Menu.Item>
                        <Menu.Item key="2">关闭其他标签页</Menu.Item>
                        <Menu.Item key="3">关闭左侧标签页</Menu.Item>
                        <Menu.Item key="4">关闭右侧标签页</Menu.Item>
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
              // 先这样吧
              setTimeout(() => {
                if (item.active && item.editor) {
                  item.editor.focus();
                }
              }, 100);
              return (
                <div
                  className="w-full"
                  key={`fe_${item.script.uuid}`}
                  style={{
                    display: item.active ? "block" : "none",
                  }}
                >
                  <Editor
                    id={`e_${item.script.uuid}`}
                    script={item.script}
                    hotKeys={item.hotKeys}
                    callbackEditor={(e) => {
                      setEditors((prev) => {
                        prev.forEach((v) => {
                          if (v.script.uuid === item.script.uuid) {
                            v.editor = e;
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

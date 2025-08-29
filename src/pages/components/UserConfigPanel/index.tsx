import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next"; // 添加这行导入语句
import type { Script, UserConfig } from "@App/app/repo/scripts";
import type { FormInstance } from "@arco-design/web-react";
import {
  Checkbox,
  Form,
  Input,
  InputNumber,
  Message,
  Modal,
  Popover,
  Select,
  Space,
  Switch,
  Tabs,
} from "@arco-design/web-react";
import TabPane from "@arco-design/web-react/es/Tabs/tab-pane";
import { ValueClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";

const FormItem = Form.Item;

const UserConfigPanel: React.FC<{
  script: Script;
  userConfig: UserConfig;
  values: { [key: string]: any };
}> = ({ script, userConfig, values }) => {
  const formRefs = useRef<{ [key: string]: FormInstance }>({});
  const [visible, setVisible] = React.useState(true);
  const [tab, setTab] = React.useState(Object.keys(userConfig)[0]);
  useEffect(() => {
    setTab(Object.keys(userConfig)[0]);
    setVisible(true);
  }, [script, userConfig]);

  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      title={`${script.name} ${t("config")}`} // 替换为键值对应的英文文本
      okText={<Popover content={t("save_only_current_group")}>{t("save")}</Popover>}
      cancelText={t("close")} // 替换为键值对应的英文文本
      onOk={() => {
        if (formRefs.current[tab]) {
          const saveValues = formRefs.current[tab].getFieldsValue();
          // 更新value
          const valueClient = new ValueClient(message);
          for (const key of Object.keys(saveValues)) {
            for (const valueKey of Object.keys(saveValues[key])) {
              if (saveValues[key][valueKey] === undefined) {
                continue;
              }
              valueClient.setScriptValue(script.uuid, `${key}.${valueKey}`, saveValues[key][valueKey]);
            }
          }
          Message.success(t("save_success")!); // 替换为键值对应的英文文本
          setVisible(false);
        }
      }}
      onCancel={() => {
        setVisible(false);
      }}
    >
      <Tabs
        activeTab={tab}
        onChange={(value) => {
          setTab(value);
        }}
      >
        {Object.keys(userConfig).map((itemKey) => {
          const value = userConfig[itemKey];
          const keys = Object.keys(value).sort((a, b) => {
            return (value[a].index || 0) - (value[b].index || 0);
          });
          console.log("keys", value, keys);
          return (
            <TabPane key={itemKey} title={itemKey}>
              <Form
                key={script.uuid}
                style={{
                  width: "100%",
                }}
                autoComplete="off"
                layout="vertical"
                initialValues={values}
                ref={(el: FormInstance) => {
                  formRefs.current[itemKey] = el;
                }}
              >
                {keys.map((key) => (
                  <FormItem key={key} label={value[key].title} field={`${itemKey}.${key}`}>
                    {() => {
                      const item = value[key];
                      let { type } = item;
                      if (!type) {
                        // 根据其他值判断类型
                        if (typeof item.default === "boolean") {
                          type = "checkbox";
                        } else if (item.values) {
                          if (typeof item.values === "object") {
                            type = "mult-select";
                          } else {
                            type = "select";
                          }
                        } else if (typeof item.default === "number") {
                          type = "number";
                        } else {
                          type = "text";
                        }
                      }
                      switch (type) {
                        case "text":
                          if (item.password) {
                            return <Input.Password placeholder={item.description} maxLength={item.max} />;
                          }
                          return <Input placeholder={item.description} maxLength={item.max} showWordLimit />;
                        case "number":
                          return (
                            <InputNumber
                              placeholder={item.description}
                              min={item.min}
                              max={item.max}
                              suffix={item.unit}
                            />
                          );
                        case "checkbox":
                          return <Checkbox defaultChecked={values[`${itemKey}.${key}`]}>{item.description}</Checkbox>;
                        case "select":
                        case "mult-select":
                          // eslint-disable-next-line no-case-declarations
                          let options: any[];
                          if (item.bind) {
                            const bindKey = item.bind.substring(1);
                            if (values[bindKey]) {
                              options = values[bindKey]!;
                            } else {
                              options = [];
                            }
                          } else {
                            options = item.values!;
                          }
                          return (
                            <Select
                              mode={item.type === "mult-select" ? "multiple" : undefined}
                              placeholder={item.description}
                            >
                              {options!.map((option) => (
                                <Select.Option key={option} value={option}>
                                  {option}
                                </Select.Option>
                              ))}
                            </Select>
                          );
                        case "textarea":
                          return (
                            <Input.TextArea
                              placeholder={item.description}
                              maxLength={item.max}
                              rows={item.rows}
                              showWordLimit
                            />
                          );
                        case "switch":
                          return (
                            <Space>
                              <Switch
                                defaultChecked={values[`${itemKey}.${key}`]}
                                onChange={(val) => {
                                  formRefs.current[itemKey].setFieldValue(`${itemKey}.${key}`, val);
                                }}
                              />
                              <span>{item.description}</span>
                            </Space>
                          );
                        default:
                          return null;
                      }
                    }}
                  </FormItem>
                ))}
              </Form>
            </TabPane>
          );
        })}
      </Tabs>
    </Modal>
  );
};

export default UserConfigPanel;

import type { Script } from "@App/app/repo/scripts";
import { valueClient } from "@App/pages/store/features/script";
import type { TKeyValuePair } from "@App/pkg/utils/message_value";
import { encodeRValue } from "@App/pkg/utils/message_value";
import { valueType } from "@App/pkg/utils/utils";
import { Button, Drawer, Form, Input, Message, Modal, Popconfirm, Select, Space, Table } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete, IconEdit, IconSearch } from "@arco-design/web-react/icon";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const FormItem = Form.Item;

interface ValueModel {
  key: string;
  value: any;
}

const ScriptStorage: React.FC<{
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [data, setData] = useState<ValueModel[]>([]);
  const [rawData, setRawData] = useState<{ [key: string]: any }>({});
  const [currentValue, setCurrentValue] = useState<ValueModel>();
  const [visibleEdit, setVisibleEdit] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [form] = Form.useForm();
  const { t } = useTranslation();

  // 保存单个键值
  const saveData = (key: string, value: any) => {
    valueClient.setScriptValue({ uuid: script!.uuid, key, value, ts: Date.now() });
    const newRawData = { ...rawData, [key]: value };
    if (value === undefined) {
      delete newRawData[key];
    }
    updateRawData(newRawData);
  };

  // 保存所有键值
  const saveRawData = (newRawValue: { [key: string]: any }) => {
    const keyValuePairs = [] as TKeyValuePair[];
    for (const [key, value] of Object.entries(newRawValue)) {
      keyValuePairs.push([key, encodeRValue(value)]);
    }
    valueClient.setScriptValues({ uuid: script!.uuid, keyValuePairs, isReplace: true, ts: Date.now() });
    updateRawData(newRawValue);
  };

  // 更新UI数据
  const updateRawData = (newRawValue: { [key: string]: any }) => {
    setRawData(newRawValue);
    setEditValue(JSON.stringify(newRawValue, null, 2));
    setData(
      Object.keys(newRawValue).map((key) => {
        return { key: key, value: newRawValue[key] };
      })
    );
  };

  // 删除单个键值
  const deleteData = (key: string) => {
    saveData(key, undefined);
    Message.info({
      content: t("delete_success"),
    });
  };

  // 清空所有键值
  const clearData = () => {
    saveRawData({});
    Message.info({
      content: t("clear_success"),
    });
  };

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    valueClient.getScriptValue(script).then((rawValue) => {
      updateRawData(rawValue);
    });
  }, [script]);
  const columns: ColumnProps[] = [
    {
      title: t("key"),
      dataIndex: "key",
      key: "key",
      filterIcon: <IconSearch />,
      width: 140,
      filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
        return (
          <div className="arco-table-custom-filter">
            <Input.Search
              searchButton
              autoFocus
              placeholder={t("enter_key")!}
              value={filterKeys[0] || ""}
              onChange={(value) => {
                setFilterKeys(value ? [value] : []);
              }}
              onSearch={() => {
                confirm();
              }}
            />
          </div>
        );
      },
      onFilter: (value, row) => !value || row.key.includes(value),
    },
    {
      title: t("value"),
      dataIndex: "value",
      key: "value",
      className: "max-table-cell",
      render(col) {
        switch (typeof col) {
          case "string":
            return col;
          default:
            return (
              <span
                style={{
                  whiteSpace: "break-spaces",
                }}
              >
                {JSON.stringify(col, null, 2)}
              </span>
            );
        }
      },
    },
    {
      title: t("type"),
      dataIndex: "value",
      width: 90,
      key: "type",
      render(col) {
        return valueType(col);
      },
    },
    {
      title: t("action"),
      render(_col, value: { key: string; value: string }) {
        return (
          <Space>
            <Button
              type="text"
              icon={<IconEdit />}
              onClick={() => {
                setCurrentValue(value);
                setVisibleEdit(true);
              }}
            />
            <Button
              type="text"
              iconOnly
              icon={<IconDelete />}
              onClick={() => {
                deleteData(value.key);
              }}
            />
          </Space>
        );
      },
    },
  ];

  return (
    <Drawer
      width={600}
      title={
        <span>
          {script?.name} {t("script_storage")}
        </span>
      }
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
      footer={null}
    >
      <Modal
        title={currentValue ? t("edit_value") : t("add_value")}
        visible={visibleEdit}
        onOk={() => {
          form.validate().then((value: { key: string; value: any; type: string }) => {
            switch (value.type) {
              case "number":
                value.value = Number(value.value);
                break;
              case "boolean":
                value.value = value.value === "true";
                break;
              case "object":
                value.value = JSON.parse(value.value);
                break;
              default:
                break;
            }
            saveData(value.key, value.value);

            Message.info({
              content: currentValue ? t("update_success") : t("add_success"),
            });
            setVisibleEdit(false);
          });
        }}
        onCancel={() => setVisibleEdit(false)}
      >
        {visibleEdit && (
          <Form
            form={form}
            initialValues={{
              key: currentValue?.key,
              value:
                typeof currentValue?.value === "string"
                  ? currentValue?.value
                  : JSON.stringify(currentValue?.value, null, 2),
              type: valueType(currentValue?.value || "string"),
            }}
          >
            <FormItem label="Key" field="key" rules={[{ required: true }]}>
              <Input placeholder={t("key_placeholder")!} disabled={!!currentValue} />
            </FormItem>
            <FormItem label="Value" field="value" rules={[{ required: true }]}>
              <Input.TextArea rows={6} placeholder={t("value_placeholder")!} />
            </FormItem>
            <FormItem label={t("type")} field="type" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="string">{t("type_string")}</Select.Option>
                <Select.Option value="number">{t("type_number")}</Select.Option>
                <Select.Option value="boolean">{t("type_boolean")}</Select.Option>
                <Select.Option value="object">{t("type_object")}</Select.Option>
              </Select>
            </FormItem>
          </Form>
        )}
      </Modal>
      <Space className="tw-w-full" direction="vertical">
        <Space className="!tw-flex tw-justify-end">
          {isEdit ? (
            <>
              <Button
                type="primary"
                status="warning"
                onClick={() => {
                  setEditValue(JSON.stringify(rawData, null, 2));
                }}
              >
                {t("restore")}
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  try {
                    const newValue = JSON.parse(editValue);
                    saveRawData(newValue);
                    Message.info({
                      content: t("save_success"),
                    });
                  } catch (err) {
                    Message.error({
                      content: `${t("save_failed")}: ${err}`,
                    });
                  }
                }}
              >
                {t("save")}
              </Button>
            </>
          ) : (
            <>
              <Popconfirm
                focusLock
                title={t("confirm_clear")}
                onOk={() => {
                  clearData();
                }}
              >
                <Button type="primary" status="warning">
                  {t("clear")}
                </Button>
              </Popconfirm>
              <Button
                type="primary"
                onClick={() => {
                  setCurrentValue(undefined);
                  setVisibleEdit(true);
                }}
              >
                {t("add")}
              </Button>
            </>
          )}
          <Button
            type="primary"
            status="success"
            onClick={() => {
              setIsEdit(!isEdit);
            }}
          >
            {isEdit ? t("individual_edit") : t("batch_edit")}
          </Button>
        </Space>
        {isEdit ? (
          <Input.TextArea
            value={editValue}
            onChange={(value) => setEditValue(value)}
            style={{ height: "calc(95vh - 100px)" }}
          />
        ) : (
          <Table columns={columns} data={data} rowKey="id" />
        )}
      </Space>
    </Drawer>
  );
};

export default ScriptStorage;

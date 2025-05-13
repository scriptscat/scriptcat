import { Script } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import { valueClient } from "@App/pages/store/features/script";
import { valueType } from "@App/pkg/utils/utils";
import { Button, Drawer, Form, Input, Message, Modal, Popconfirm, Select, Space, Table } from "@arco-design/web-react";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete, IconEdit, IconSearch } from "@arco-design/web-react/icon";
import React, { useEffect, useRef, useState } from "react";
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
  const inputRef = useRef<RefInputType>(null);
  const [currentValue, setCurrentValue] = useState<ValueModel>();
  const [visibleEdit, setVisibleEdit] = useState(false);
  const [form] = Form.useForm();
  const { t } = useTranslation();

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    valueClient.getScriptValue(script).then((value) => {
      setData(
        Object.keys(value).map((key) => {
          return { key: key, value: value[key] };
        })
      );
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
              ref={inputRef}
              searchButton
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
      onFilter: (value, row) => (value ? row.key.indexOf(value) !== -1 : true),
      onFilterDropdownVisibleChange: (v) => {
        if (v) {
          setTimeout(() => inputRef.current!.focus(), 150);
        }
      },
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
      render(_col, value: { key: string; value: string }, index) {
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
                valueClient.setScriptValue(script!.uuid, value.key, undefined);
                Message.info({
                  content: t("delete_success"),
                });
                setData(data.filter((_, i) => i !== index));
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
            valueClient.setScriptValue(script!.uuid, value.key, value.value);
            if (currentValue) {
              Message.info({
                content: t("update_success"),
              });
              setData(
                data.map((v) => {
                  if (v.key === value.key) {
                    return {
                      ...v,
                      value: value.value,
                    };
                  }
                  return v;
                })
              );
            } else {
              Message.info({
                content: t("add_success"),
              });
              setData([
                {
                  key: value.key,
                  value: value.value,
                },
                ...data,
              ]);
            }
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
      <Space className="w-full" direction="vertical">
        <Space className="!flex justify-end">
          <Popconfirm
            focusLock
            title={t("confirm_clear")}
            onOk={() => {
              setData((prev) => {
                prev.forEach((v) => {
                  valueClient.setScriptValue(script!.uuid, v.key, undefined);
                });
                Message.info({
                  content: t("clear_success"),
                });
                return [];
              });
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
        </Space>
        <Table columns={columns} data={data} rowKey="id" />
      </Space>
    </Drawer>
  );
};

export default ScriptStorage;

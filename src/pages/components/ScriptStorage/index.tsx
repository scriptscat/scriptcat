import IoC from "@App/app/ioc";
import { Script } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import ValueController from "@App/app/service/value/controller";
import { valueType } from "@App/pkg/utils/utils";
import {
  Button,
  Drawer,
  Form,
  Input,
  Message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
} from "@arco-design/web-react";
import FormItem from "@arco-design/web-react/es/Form/form-item";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete, IconEdit, IconSearch } from "@arco-design/web-react/icon";
import React, { useEffect, useRef, useState } from "react";

const ScriptStorage: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [data, setData] = useState<Value[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const valueCtrl = IoC.instance(ValueController) as ValueController;
  const [currentValue, setCurrentValue] = useState<Value>();
  const [visibleEdit, setVisibleEdit] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    valueCtrl.getValues(script).then((values) => {
      setData(values);
    });
    // 监听值变化
    const channel = valueCtrl.watchValue(script);
    channel.setHandler((value: Value) => {
      setData((prev) => {
        const index = prev.findIndex((item) => item.key === value.key);
        if (index === -1) {
          if (value.value === undefined) {
            return prev;
          }
          return [value, ...prev];
        }
        if (value.value === undefined) {
          prev.splice(index, 1);
          return [...prev];
        }
        prev[index] = value;
        return [...prev];
      });
    });
    return () => {
      channel.disChannel();
    };
  }, [script]);
  const columns: ColumnProps[] = [
    {
      title: "key",
      dataIndex: "key",
      key: "key",
      filterIcon: <IconSearch />,
      width: 140,
      // eslint-disable-next-line react/no-unstable-nested-components
      filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
        return (
          <div className="arco-table-custom-filter">
            <Input.Search
              ref={inputRef}
              searchButton
              placeholder="请输入key"
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
      title: "value",
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
      title: "类型",
      dataIndex: "value",
      width: 90,
      key: "type",
      render(col) {
        return valueType(col);
      },
    },
    {
      title: "操作",
      render(_col, value: Value, index) {
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
                valueCtrl.setValue(script!.id, value.key, undefined);
                Message.info({
                  content: "删除成功",
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
      title={<span>{script?.name} 脚本储存</span>}
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Modal
        title={currentValue ? "编辑值" : "新增值"}
        visible={visibleEdit}
        onOk={() => {
          form
            .validate()
            .then((value: { key: string; value: any; type: string }) => {
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
              valueCtrl.setValue(script!.id, value.key, value.value);
              if (currentValue) {
                Message.info({
                  content: "修改成功",
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
                  content: "添加成功",
                });
                setData([
                  {
                    id: 0,
                    scriptId: script!.id,
                    storageName:
                      (script?.metadata.storagename &&
                        script?.metadata.storagename[0]) ||
                      "",
                    key: value.key,
                    value: value.value,
                    createtime: Date.now(),
                    updatetime: 0,
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
              <Input placeholder="key" disabled={!!currentValue} />
            </FormItem>
            <FormItem label="Value" field="value" rules={[{ required: true }]}>
              <Input.TextArea
                rows={6}
                placeholder="当类型为object时,请输入可以JSON解析的数据"
              />
            </FormItem>
            <FormItem label="类型" field="type" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="string">string</Select.Option>
                <Select.Option value="number">number</Select.Option>
                <Select.Option value="boolean">boolean</Select.Option>
                <Select.Option value="object">object</Select.Option>
              </Select>
            </FormItem>
          </Form>
        )}
      </Modal>
      <Space className="w-full" direction="vertical">
        <Space className="!flex justify-end">
          <Popconfirm
            focusLock
            title="你真的要清空这个储存空间吗?"
            onOk={() => {
              setData((prev) => {
                prev.forEach((v) => {
                  valueCtrl.setValue(script!.id, v.key, undefined);
                });
                Message.info({
                  content: "清空成功",
                });
                return [];
              });
            }}
          >
            <Button type="primary" status="warning">
              清空
            </Button>
          </Popconfirm>
          <Button
            type="primary"
            onClick={() => {
              setCurrentValue(undefined);
              setVisibleEdit(true);
            }}
          >
            新增
          </Button>
        </Space>
        <Table columns={columns} data={data} rowKey="id" />
      </Space>
    </Drawer>
  );
};

export default ScriptStorage;

import IoC from "@App/app/ioc";
import { Resource } from "@App/app/repo/resource";
import { Script } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import ResourceController from "@App/app/service/resource/controller";
import { base64ToBlob } from "@App/pkg/utils/script";
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
import {
  IconDelete,
  IconDownload,
  IconEdit,
  IconSearch,
} from "@arco-design/web-react/icon";
import React, { useEffect, useRef, useState } from "react";

type ResourceListItem = {
  key: string;
} & Resource;

const ScriptResource: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [data, setData] = useState<ResourceListItem[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const resourceCtrl = IoC.instance(ResourceController) as ResourceController;

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    resourceCtrl.getResource(script).then((res) => {
      const arr: ResourceListItem[] = [];
      Object.keys(res).forEach((key) => {
        // @ts-ignore
        const item: ResourceListItem = res[key];
        item.key = key;
        arr.push(item);
      });
      setData(arr);
    });
    return () => {};
  }, [script]);

  const columns: ColumnProps[] = [
    {
      title: "key",
      dataIndex: "key",
      key: "key",
      filterIcon: <IconSearch />,
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
      title: "类型",
      dataIndex: "contentType",
      width: 140,
      key: "type",
      render(col, res: Resource) {
        return `${res.type}/${col}`;
      },
    },
    {
      title: "操作",
      render(_col, value: Resource, index) {
        return (
          <Space>
            <Button
              type="text"
              icon={<IconDownload />}
              onClick={() => {
                const url = URL.createObjectURL(base64ToBlob(value.base64));
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                }, 60 * 1000);
                const filename = value.url.split("/").pop();
                chrome.downloads.download({
                  url,
                  saveAs: true,
                  filename,
                });
              }}
            />
            <Popconfirm
              focusLock
              title="你确定删除此资源吗?在下次开启时将会重新加载此资源"
              onOk={() => {
                Message.info({
                  content: "删除成功",
                });
                resourceCtrl.deleteResource(value.id);
                setData(data.filter((_, i) => i !== index));
              }}
            >
              <Button type="text" iconOnly icon={<IconDelete />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Drawer
      width={600}
      title={<span>{script?.name} 脚本资源</span>}
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Space className="w-full" direction="vertical">
        <Space className="!flex justify-end">
          <Popconfirm
            focusLock
            title="你真的要清空这些资源吗?在下次开启时将会重新加载资源"
            onOk={() => {
              setData((prev) => {
                prev.forEach((v) => {
                  resourceCtrl.deleteResource(v.id);
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
        </Space>
        <Table columns={columns} data={data} rowKey="id" />
      </Space>
    </Drawer>
  );
};

export default ScriptResource;

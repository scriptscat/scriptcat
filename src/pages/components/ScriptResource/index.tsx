import { Resource } from "@App/app/repo/resource";
import { Script } from "@App/app/repo/scripts";
import { ResourceClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { base64ToBlob } from "@App/pkg/utils/script";
import { Button, Drawer, Input, Message, Popconfirm, Space, Table } from "@arco-design/web-react";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete, IconDownload, IconSearch } from "@arco-design/web-react/icon";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const resourceClient = new ResourceClient(message);

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    resourceClient.getScriptResources(script).then((res) => {
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
      title: t("key"),
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
      title: t("type"),
      dataIndex: "contentType",
      width: 140,
      key: "type",
      render(col, res: Resource) {
        return `${res.type}/${col}`;
      },
    },
    {
      title: t("action"),
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
              title={t("confirm_delete_resource")}
              onOk={() => {
                Message.info({
                  content: t("deleting"),
                });
                resourceClient
                  .deleteResource(value.url)
                  .then(() => {
                    Message.info({
                      content: t("delete_success"),
                    });
                    setData(data.filter((_, i) => i !== index));
                  })
                  .catch((e) => {
                    Message.error({
                      content: t("delete_failed") + ": " + e.message,
                    });
                  });
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
      title={
        <span>
          {script?.name} {t("script_resource")}
        </span>
      }
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Space className="w-full" direction="vertical">
        <Space className="!flex justify-end">
          <Popconfirm
            focusLock
            title={t("confirm_clear_resource")}
            onOk={() => {
              setData((prev) => {
                prev.forEach((v) => {
                  resourceClient.deleteResource(v.url);
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
        </Space>
        <Table columns={columns} data={data} rowKey="id" />
      </Space>
    </Drawer>
  );
};

export default ScriptResource;

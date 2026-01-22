import type { Resource } from "@App/app/repo/resource";
import type { Script } from "@App/app/repo/scripts";
import { ResourceClient } from "@App/app/service/service_worker/client";
import { message } from "@App/pages/store/global";
import { base64ToBlob, makeBlobURL } from "@App/pkg/utils/utils";
import { Button, Drawer, Input, Message, Popconfirm, Space, Table } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete, IconDownload, IconSearch } from "@arco-design/web-react/icon";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ResourceListItem = {
  key: string;
} & Resource;

const resourceClient = new ResourceClient(message);

const ScriptResource: React.FC<{
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [data, setData] = useState<ResourceListItem[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    if (!script) {
      return () => {};
    }
    resourceClient.getScriptResources(script).then((res) => {
      const arr: ResourceListItem[] = [];
      for (const key of Object.keys(res)) {
        // @ts-ignore
        const item: ResourceListItem = res[key];
        item.key = key;
        arr.push(item);
      }
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
                const url = makeBlobURL({ blob: base64ToBlob(value.base64), persistence: false }) as string;
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
      <Space className="tw-w-full" direction="vertical">
        <Space className="!tw-flex tw-justify-end">
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

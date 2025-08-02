import React, { useEffect, useState } from "react";
import type { Permission } from "@App/app/repo/permission";
import type { Script } from "@App/app/repo/scripts";
import { useTranslation } from "react-i18next";
import { Space, Popconfirm, Message, Button, Checkbox, Input, Modal, Select, Typography } from "@arco-design/web-react";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import Table from "@arco-design/web-react/es/Table";
import { IconDelete } from "@arco-design/web-react/icon";
import { permissionClient } from "@App/pages/store/features/script";

const PermissionManager: React.FC<{
  script: Script;
}> = ({ script }) => {
  const [permission, setPermission] = useState<Permission[]>([]);
  const [permissionVisible, setPermissionVisible] = useState<boolean>(false);
  const [permissionValue, setPermissionValue] = useState<Permission>();

  const { t } = useTranslation();

  const columns: ColumnProps[] = [
    {
      title: t("type"),
      dataIndex: "permission",
      key: "permission",
      width: 100,
    },
    {
      title: t("permission_value"),
      dataIndex: "permissionValue",
      key: "permissionValue",
    },
    {
      title: t("allow"),
      dataIndex: "allow",
      key: "allow",
      render(col, item: Permission) {
        return (
          <Select
            value={col ? "yes" : "no"}
            onChange={(value) => {
              const newAllow = value === "yes";
              const updatedPermission = { ...item, allow: newAllow };
              permissionClient
                .updatePermission(updatedPermission)
                .then(() => {
                  Message.success(t("update_success")!);
                  setPermission(
                    permission.map((p) =>
                      p.permission === item.permission && p.permissionValue === item.permissionValue
                        ? { ...p, allow: newAllow }
                        : p
                    )
                  );
                })
                .catch(() => {
                  Message.error(t("save_failed")!);
                });
            }}
            style={{ width: 80 }}
          >
            <Select.Option value="yes">
              <span style={{ color: "#52c41a" }}>{t("yes")}</span>
            </Select.Option>
            <Select.Option value="no">
              <span style={{ color: "#f5222d" }}>{t("no")}</span>
            </Select.Option>
          </Select>
        );
      },
    },
    {
      title: t("action"),
      render(_, item: Permission) {
        return (
          <Space>
            <Popconfirm
              title={t("confirm_delete_permission")}
              onOk={() => {
                permissionClient
                  .deletePermission(script.uuid, item.permission, item.permissionValue)
                  .then(() => {
                    Message.success(t("delete_success")!);
                    setPermission(
                      permission.filter(
                        (i) => !(i.permission == item.permission && i.permissionValue == item.permissionValue)
                      )
                    );
                  })
                  .catch(() => {
                    Message.error(t("delete_failed")!);
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

  useEffect(() => {
    if (script) {
      permissionClient.getScriptPermissions(script.uuid).then((list) => {
        setPermission(list);
      });
    }
  }, [script]);

  return (
    <>
      <Modal
        title={t("add_permission")}
        visible={permissionVisible}
        onCancel={() => setPermissionVisible(false)}
        onOk={() => {
          if (permissionValue) {
            permission.push({
              uuid: script.uuid,
              permission: permissionValue.permission,
              permissionValue: permissionValue.permissionValue,
              allow: permissionValue.allow,
              createtime: Date.now(),
              updatetime: 0,
            });
            permissionClient.addPermission(permissionValue).then(() => {
              setPermission([...permission]);
              setPermissionVisible(false);
            });
          }
        }}
      >
        <Space className="w-full" direction="vertical">
          <Select
            value={permissionValue?.permission}
            onChange={(e) => {
              permissionValue && setPermissionValue({ ...permissionValue, permission: e });
            }}
          >
            <Select.Option value="cors">{t("permission_cors")}</Select.Option>
            <Select.Option value="cookie">{t("permission_cookie")}</Select.Option>
          </Select>
          <Input
            value={permissionValue?.permissionValue}
            onChange={(e) => {
              permissionValue && setPermissionValue({ ...permissionValue, permissionValue: e });
            }}
          />
          <Checkbox
            checked={permissionValue?.allow}
            onChange={(e) => {
              permissionValue && setPermissionValue({ ...permissionValue, allow: e });
            }}
          >
            {t("allow")}
          </Checkbox>
        </Space>
      </Modal>
      <div className="flex flex-row justify-between pb-2">
        <Typography.Title heading={6}>{t("permission_management")}</Typography.Title>
        <Space>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setPermissionValue({
                uuid: script.uuid,
                permission: "cors",
                permissionValue: "",
                allow: true,
                createtime: 0,
                updatetime: 0,
              });
              setPermissionVisible(true);
            }}
          >
            {t("add_permission")}
          </Button>
          <Popconfirm
            title={t("confirm_reset")}
            onOk={() => {
              permissionClient.resetPermission(script.uuid).then(() => {
                setPermission([]);
              });
            }}
          >
            <Button type="primary" size="small" status="warning">
              {t("reset")}
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Table columns={columns} data={permission} rowKey="id" pagination={false} />
    </>
  );
};

export default PermissionManager;

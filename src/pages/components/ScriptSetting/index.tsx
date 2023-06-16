import IoC from "@App/app/ioc";
import { Permission } from "@App/app/repo/permission";
import { Script } from "@App/app/repo/scripts";
import PermissionController from "@App/app/service/permission/controller";
import { formatUnixTime } from "@App/pkg/utils/utils";
import {
  Button,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  Message,
  Popconfirm,
  Space,
  Table,
  Typography,
} from "@arco-design/web-react";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete } from "@arco-design/web-react/icon";
import React, { useEffect, useState } from "react";
import ScriptController from "@App/app/service/script/controller";
import { useTranslation } from "react-i18next";
import Match from "./Match";

const ScriptSetting: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const permissionCtrl = IoC.instance(
    PermissionController
  ) as PermissionController;
  const scriptCtrl = IoC.instance(ScriptController) as ScriptController;
  const [permission, setPermission] = useState<Permission[]>([]);
  const [checkUpdateUrl, setCheckUpdateUrl] = useState<string>("");
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
      render(col) {
        if (col) {
          return <span style={{ color: "#52c41a" }}>{t("yes")}</span>;
        }
        return <span style={{ color: "#f5222d" }}>{t("no")}</span>;
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
                permissionCtrl
                  .deletePermission(script!.id, {
                    permission: item.permission,
                    permissionValue: item.permissionValue,
                  })
                  .then(() => {
                    Message.success(t("delete_success")!);
                    setPermission(permission.filter((i) => i.id !== item.id));
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
      scriptCtrl.scriptDAO.findById(script.id).then((v) => {
        setCheckUpdateUrl(v?.downloadUrl || "");
      });
      permissionCtrl.getPermissions(script.id).then((list) => {
        setPermission(list);
      });
    }
  }, [script]);

  return (
    <Drawer
      width={600}
      title={
        <span>
          {script?.name} {t("script_setting")}
        </span>
      }
      visible={visible}
      onOk={() => {
        onOk();
      }}
      onCancel={() => {
        onCancel();
      }}
    >
      <Descriptions
        column={1}
        title={t("basic_info")}
        data={[
          {
            label: t("last_updated"),
            value: formatUnixTime(
              (script?.updatetime || script?.createtime || 0) / 1000
            ),
          },
          {
            label: "UUID",
            value: script?.uuid,
          },
        ]}
        style={{ marginBottom: 20 }}
        labelStyle={{ paddingRight: 36 }}
      />
      <Divider />
      {script && <Match script={script} />}
      <Descriptions
        column={1}
        title={t("update")}
        data={[
          {
            label: t("update_url"),
            value: (
              <Input
                value={checkUpdateUrl}
                onChange={(e) => {
                  setCheckUpdateUrl(e);
                }}
                onBlur={() => {
                  scriptCtrl
                    .updateCheckUpdateUrl(script!.id, checkUpdateUrl)
                    .then(() => {
                      Message.success(t("update_success")!);
                    });
                }}
              />
            ),
          },
        ]}
        style={{ marginBottom: 20 }}
        labelStyle={{ paddingRight: 36 }}
      />
      <Divider />
      <Typography.Title heading={6}>
        {t("permission_management")}
      </Typography.Title>
      <Table columns={columns} data={permission} rowKey="id" />
      <Empty description={t("under_construction")} />
    </Drawer>
  );
};

export default ScriptSetting;

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
  Message,
  Popconfirm,
  Space,
  Table,
} from "@arco-design/web-react";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconDelete } from "@arco-design/web-react/icon";
import React, { useEffect, useState } from "react";

const ScriptSetting: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  const [permission, setPermission] = useState<Permission[]>([]);

  const permissionCtrl = IoC.instance(
    PermissionController
  ) as PermissionController;

  const columns: ColumnProps[] = [
    {
      title: "类型",
      dataIndex: "permission",
      key: "permission",
      width: 80,
    },
    {
      title: "授权值",
      dataIndex: "permissionValue",
      key: "permissionValue",
    },
    {
      title: "是否允许",
      dataIndex: "allow",
      key: "allow",
      render(col) {
        if (col) {
          return <span style={{ color: "#52c41a" }}>是</span>;
        }
        return <span style={{ color: "#f5222d" }}>否</span>;
      },
    },
    {
      title: "操作",
      render(_, item: Permission) {
        return (
          <Space>
            <Popconfirm
              title="确认删除该授权?"
              onOk={() => {
                permissionCtrl
                  .deletePermission(script!.id, {
                    permission: item.permission,
                    permissionValue: item.permissionValue,
                  })
                  .then(() => {
                    Message.success("删除成功");
                    setPermission(permission.filter((i) => i.id !== item.id));
                  })
                  .catch(() => {
                    Message.error("删除失败");
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
      permissionCtrl.getPermissions(script.id).then((list) => {
        setPermission(list);
      });
    }
  }, [script]);

  return (
    <Drawer
      width={600}
      title={<span>{script?.name} 脚本设置</span>}
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
        title="基本信息"
        data={[
          {
            label: "最后更新",
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
      <Table columns={columns} data={permission} rowKey="id" />
      <Empty description="建设中" />
    </Drawer>
  );
};

export default ScriptSetting;

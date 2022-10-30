import { Script } from "@App/app/repo/scripts";
import { Drawer, Empty } from "@arco-design/web-react";
import React from "react";

const ScriptStorage: React.FC<{
  // eslint-disable-next-line react/require-default-props
  script?: Script;
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}> = ({ script, visible, onCancel, onOk }) => {
  return (
    <Drawer
      width={332}
      title={<span>{script?.name} 脚本储存</span>}
      visible={visible}
      onOk={onOk}
      onCancel={onCancel}
    >
      <Empty description="建设中" />
    </Drawer>
  );
};

export default ScriptStorage;

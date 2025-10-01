import React from "react";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  /**
   * 侧边栏是否打开
   */
  open: boolean;
}

/**
 * 脚本列表侧边栏组件
 */
const ScriptListSidebar: React.FC<SidebarProps> = ({ open }) => {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return (
    <div
      className="w-64"
      style={{
        minWidth: "256px",
        padding: "12px",
        borderRight: "1px solid var(--color-neutral-3)",
        borderBottom: "1px solid var(--color-neutral-3)",
      }}
    ></div>
  );
};

export default ScriptListSidebar;

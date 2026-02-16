import type { ReactNode } from "react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

const CustomLink: React.FC<{
  children: ReactNode;
  to: string;
  className?: string;
  search?: string;
}> = ({ children, to, search, className }) => {
  const nav = useNavigate();
  const { t } = useTranslation();

  const click = () => {
    if (window.onbeforeunload) {
      // 目前仅用于 ScriptEditor 编辑内容修改提示
      if (confirm(t("script_modified_leave_confirm"))) {
        nav({
          pathname: to,
          search,
        });
      }
    } else {
      nav({
        pathname: to,
        search,
      });
    }
  };

  return (
    <div className={className} onClick={click}>
      {children}
    </div>
  );
};

export default CustomLink;

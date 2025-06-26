import React, { ReactNode } from "react";
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
      if (confirm(t("confirm_leave_page"))) {
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

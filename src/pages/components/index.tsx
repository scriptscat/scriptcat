import React, { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const CustomLink: React.FC<{
  children: ReactNode;
  to: string;
  className?: string;
}> = ({ children, to, className }) => {
  const nav = useNavigate();
  const location = useLocation();

  const click = () => {
    if (location.pathname.startsWith("/script/editor")) {
      if (
        confirm("当前正在编辑状态，跳转其它页面将会丢失当前内容，是否跳转？")
      ) {
        nav(to);
      }
    } else {
      nav(to);
    }
  };

  return (
    <div className={className} onClick={click}>
      {children}
    </div>
  );
};

export default CustomLink;

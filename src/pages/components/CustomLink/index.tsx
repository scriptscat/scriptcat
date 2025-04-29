import React, { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const CustomLink: React.FC<{
  children: ReactNode;
  to: string;
  className?: string;
  search?: string;
}> = ({ children, to, search, className }) => {
  const nav = useNavigate();

  const click = () => {
    if (window.onbeforeunload) {
      if (confirm("当前正在编辑状态，跳转其它页面将会丢失当前内容，是否跳转？")) {
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

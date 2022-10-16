import React, { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

const CustomLink: React.FC<{
  children: ReactNode;
  to: string;
  // eslint-disable-next-line react/require-default-props
  className?: string;
  // eslint-disable-next-line react/require-default-props
  search?: string;
}> = ({ children, to, search, className }) => {
  const nav = useNavigate();

  const click = () => {
    if (window.onbeforeunload) {
      if (
        // eslint-disable-next-line no-restricted-globals, no-alert
        confirm("当前正在编辑状态，跳转其它页面将会丢失当前内容，是否跳转？")
      ) {
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={className} onClick={click}>
      {children}
    </div>
  );
};

export default CustomLink;

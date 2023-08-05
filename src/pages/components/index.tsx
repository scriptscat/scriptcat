import { Link } from "@arco-design/web-react";
import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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

// 因为i18n的Trans组件打包后出现问题，所以自己实现一个
export const CustomTrans: React.FC<{
  i18nKey: string;
}> = ({ i18nKey }) => {
  const { t } = useTranslation();
  // eslint-disable-next-line no-undef
  const children: (JSX.Element | string)[] = [];
  let content = t(i18nKey);
  for (;;) {
    const i = content.indexOf("<");
    if (i !== -1) {
      children.push(content.substring(0, i));
      const end = content.indexOf(">", i);
      const key = content.substring(i + 1, end).split(" ")[0];
      const tag = content.substring(i, end + 1);
      const tagEnd = content.indexOf(`</${key}>`, end);
      const element = content.substring(
        end + 1,
        content.indexOf(`</${key}>`, end)
      );
      switch (key) {
        case "Link":
          // eslint-disable-next-line no-case-declarations
          const href = tag.match(/href="(.*)"/)![1];
          children.push(
            <Link key={`i${i}`} href={href} target="_black">
              {element}
            </Link>
          );
          break;
        default:
          children.push(element);
          break;
      }
      content = content.substring(tagEnd + key.length + 3);
    } else {
      children.push(content);
      break;
    }
  }

  return <div>{children}</div>;
};

export default CustomLink;

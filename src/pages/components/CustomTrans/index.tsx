import { Link } from "@arco-design/web-react";
import React from "react";
import { useTranslation } from "react-i18next";

// 因为i18n的Trans组件打包后出现问题，所以自己实现一个
export const CustomTrans: React.FC<{
  i18nKey: string;
}> = ({ i18nKey }) => {
  const { t } = useTranslation();
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
      const element = content.substring(end + 1, content.indexOf(`</${key}>`, end));
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

export default CustomTrans;

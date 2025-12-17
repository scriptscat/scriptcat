import React, { ReactNode } from "react";
import { arcoLocale } from "@App/locales/arco";
import i18n from "@App/locales/locales";
import { ConfigProvider } from "@arco-design/web-react";

const PopupLayout: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <ConfigProvider locale={arcoLocale(i18n.language)}>
      <div
        style={{
          borderBottom: "1px solid var(--color-neutral-3)",
        }}
      >
        {children}
      </div>
    </ConfigProvider>
  );
};

export default PopupLayout;

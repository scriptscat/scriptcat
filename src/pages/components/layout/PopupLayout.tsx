import type { ReactNode } from "react";
import React from "react";
import "./index.css";
import { ConfigProvider } from "@arco-design/web-react";
import { arcoLocale } from "@App/locales/arco";
import i18n from "@App/locales/locales";

const PopupLayout: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <ConfigProvider locale={arcoLocale(i18n.language)}>
      <div style={{ borderBottom: "1px solid var(--color-neutral-3)" }}>{children}</div>
    </ConfigProvider>
  );
};

export default PopupLayout;

import type { ReactNode } from "react";
import React from "react";
import "./index.css";

const PopupLayout: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  return <div style={{ borderBottom: "1px solid var(--color-neutral-3)" }}>{children}</div>;
};

export default PopupLayout;

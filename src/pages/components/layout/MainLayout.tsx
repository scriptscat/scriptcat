import { Avatar, Layout, Typography } from "@arco-design/web-react";
import React, { ReactNode } from "react";

const MainLayout: React.FC<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <Layout>
      <Layout.Header
        style={{
          height: "50px",
          borderBottom: "1px solid #e8e8e8",
        }}
        className="flex items-center justify-between p-x-4"
      >
        <div className="flex row items-center">
          <img
            style={{ height: "40px" }}
            src="/assets/logo.png"
            alt="ScriptCat"
          />
          <Typography.Title heading={4} className="!m-0">
            ScriptCat
          </Typography.Title>
        </div>
        <div>
          <Avatar size={32}>王</Avatar>
        </div>
      </Layout.Header>
      <Layout
        className="absolute top-50px bottom-0 !flex-row w-full"
        style={{
          boxShadow: "unset",
        }}
      >
        {children}
      </Layout>
    </Layout>
  );
};

export default MainLayout;

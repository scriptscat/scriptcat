import React from "react";
import { Menu, ResizeBox } from "@arco-design/web-react";
import {
  IconCode,
  IconSubscribe,
  IconFile,
  IconTool,
  IconSettings,
} from "@arco-design/web-react/icon";
import { Link } from "react-router-dom";

const MenuItem = Menu.Item;
function Subscribe() {
  return (
    <div>
      <ResizeBox
        directions={["right"]}
        style={{ width: "15%", height: "100%" }}
      >
        <Menu style={{ width: "100%", height: "100%" }} selectable>
          <Link to="/">
            <MenuItem key="/">
              <IconCode /> 脚本列表
            </MenuItem>
          </Link>
          <Link to="/subscribe">
            <MenuItem key="/subscribe">
              <IconSubscribe /> 订阅列表
            </MenuItem>
          </Link>
          <Link to="/logger">
            <MenuItem key="/logger">
              <IconFile /> 运行日志
            </MenuItem>
          </Link>
          <Link to="/tools">
            <MenuItem key="/tools">
              <IconTool /> 系统工具
            </MenuItem>
          </Link>
          <Link to="/setting">
            <MenuItem key="/setting">
              <IconSettings /> 系统设置
            </MenuItem>
          </Link>
        </Menu>
      </ResizeBox>
    </div>
  );
}

export default Subscribe;

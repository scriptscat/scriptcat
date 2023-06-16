/* eslint-disable import/prefer-default-export */
import React from "react";
import IoC from "@App/app/ioc";
import { Script, ScriptDAO } from "@App/app/repo/scripts";
import ValueManager from "@App/app/service/value/manager";
import { Button, Space, Tooltip } from "@arco-design/web-react";
import {
  IconBug,
  IconCode,
  IconGithub,
  IconHome,
} from "@arco-design/web-react/icon";

// 较对脚本排序位置
export function scriptListSort(result: Script[]) {
  const dao = new ScriptDAO();
  for (let i = 0; i < result.length; i += 1) {
    if (result[i].sort !== i) {
      dao.update(result[i].id, { sort: i });
      result[i].sort = i;
    }
  }
}

// 安装url转home主页
export function installUrlToHome(installUrl: string) {
  try {
    // 解析scriptcat
    if (installUrl.indexOf("scriptcat.org") !== -1) {
      const id = installUrl.split("/")[5];
      return (
        <Button
          type="text"
          iconOnly
          size="small"
          target="_blank"
          href={`https://scriptcat.org/script-show-page/${id}`}
        >
          <img width={16} height={16} src="/assets/logo.png" alt="" />
        </Button>
      );
    }
    if (installUrl.indexOf("greasyfork.org") !== -1) {
      const id = installUrl.split("/")[4];
      return (
        <Button
          type="text"
          iconOnly
          size="small"
          target="_blank"
          href={`https://greasyfork.org/scripts/${id}`}
        >
          <img width={16} height={16} src="/assets/logo/gf.png" alt="" />
        </Button>
      );
    }
    if (installUrl.indexOf("raw.githubusercontent.com") !== -1) {
      const repo = `${installUrl.split("/")[3]}/${installUrl.split("/")[4]}`;
      return (
        <Button
          type="text"
          iconOnly
          size="small"
          target="_blank"
          href={`https://github.com/${repo}`}
          style={{
            color: "var(--color-text-1)",
          }}
          icon={<IconGithub />}
        />
      );
    }
    if (installUrl.indexOf("github.com") !== -1) {
      const repo = `${installUrl.split("/")[3]}/${installUrl.split("/")[4]}`;
      return (
        <Button
          type="text"
          iconOnly
          size="small"
          target="_blank"
          href={`https://github.com/${repo}`}
          style={{
            color: "var(--color-text-1)",
          }}
          icon={<IconGithub />}
        />
      );
    }
  } catch (e) {
    // ignore error
  }
  return undefined;
}

export function listHomeRender(item: Script) {
  let home;
  if (!item.metadata.homepageurl) {
    home = installUrlToHome(item.downloadUrl || "");
  }
  return (
    <Space size="mini">
      {home && <Tooltip content="脚本主页">{home}</Tooltip>}
      {item.metadata.homepage && (
        <Tooltip content="脚本主页">
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={item.metadata.homepage[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {item.metadata.homepageurl && (
        <Tooltip content="脚本主页">
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={item.metadata.homepageurl[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {item.metadata.website && (
        <Tooltip content="脚本站点">
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={item.metadata.website[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {item.metadata.source && (
        <Tooltip content="脚本源码">
          <Button
            type="text"
            iconOnly
            icon={<IconCode />}
            size="small"
            href={item.metadata.source[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {item.metadata.supporturl && (
        <Tooltip content="BUG反馈/脚本支持站点">
          <Button
            type="text"
            iconOnly
            icon={<IconBug />}
            size="small"
            href={item.metadata.supporturl[0]}
            target="_blank"
          />
        </Tooltip>
      )}
    </Space>
  );
}

export function getValues(script: Script) {
  const { config } = script;
  return (IoC.instance(ValueManager) as ValueManager)
    .getValues(script)
    .then((data) => {
      const newValues: { [key: string]: any } = {};
      Object.keys(config!).forEach((tabKey) => {
        const tab = config![tabKey];
        Object.keys(tab).forEach((key) => {
          // 动态变量
          if (tab[key].bind) {
            const bindKey = tab[key].bind!.substring(1);
            newValues[bindKey] =
              data[bindKey] === undefined ? undefined : data[bindKey].value;
          }
          newValues[`${tabKey}.${key}`] =
            data[`${tabKey}.${key}`] === undefined
              ? config![tabKey][key].default
              : data[`${tabKey}.${key}`].value;
        });
      });
      return newValues;
    });
}

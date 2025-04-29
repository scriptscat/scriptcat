import React from "react";
import { Metadata, Script, ScriptDAO } from "@App/app/repo/scripts";
import { Avatar, Button, Space, Tooltip } from "@arco-design/web-react";
import { IconBug, IconCode, IconGithub, IconHome } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";

// 较对脚本排序位置
export function scriptListSort(result: Script[]) {
  const dao = new ScriptDAO();
  for (let i = 0; i < result.length; i += 1) {
    if (result[i].sort !== i) {
      dao.update(result[i].uuid, { sort: i });
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
        <Button type="text" iconOnly size="small" target="_blank" href={`https://scriptcat.org/script-show-page/${id}`}>
          <img width={16} height={16} src="/assets/logo.png" alt="" />
        </Button>
      );
    }
    if (installUrl.indexOf("greasyfork.org") !== -1) {
      const id = installUrl.split("/")[4];
      return (
        <Button type="text" iconOnly size="small" target="_blank" href={`https://greasyfork.org/scripts/${id}`}>
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
    console.error(e);
  }
  return undefined;
}

export function ListHomeRender({ script }: { script: Script }) {
  const { t } = useTranslation();
  let home;
  if (!script.metadata.homepageurl) {
    home = installUrlToHome(script.downloadUrl || "");
  }
  return (
    <Space size="mini">
      {home && <Tooltip content={t("homepage")}>{home}</Tooltip>}
      {script.metadata.homepage && (
        <Tooltip content={t("homepage")}>
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={script.metadata.homepage[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {script.metadata.homepageurl && (
        <Tooltip content={t("homepage")}>
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={script.metadata.homepageurl[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {script.metadata.website && (
        <Tooltip content={t("script_website")}>
          <Button
            type="text"
            iconOnly
            icon={<IconHome />}
            size="small"
            href={script.metadata.website[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {script.metadata.source && (
        <Tooltip content={t("script_source")}>
          <Button
            type="text"
            iconOnly
            icon={<IconCode />}
            size="small"
            href={script.metadata.source[0]}
            target="_blank"
          />
        </Tooltip>
      )}
      {script.metadata.supporturl && (
        <Tooltip content={t("bug_feedback_script_support")}>
          <Button
            type="text"
            iconOnly
            icon={<IconBug />}
            size="small"
            href={script.metadata.supporturl[0]}
            target="_blank"
          />
        </Tooltip>
      )}
    </Space>
  );
}

export type ScriptIconsProps = {
  script: { name: string; metadata: Metadata };
  size?: number;
  style?: React.CSSProperties;
};

export function ScriptIcons({ script, size = 32, style }: ScriptIconsProps) {
  style = style || {};
  style.display = style.display || "inline-block";
  style.marginRight = style.marginRight || "8px";
  let icon = "";
  if (script.metadata.icon) {
    [icon] = script.metadata.icon;
  } else if (script.metadata.iconurl) {
    [icon] = script.metadata.iconurl;
  } else if (script.metadata.icon64) {
    [icon] = script.metadata.icon64;
  } else if (script.metadata.icon64url) {
    [icon] = script.metadata.icon64url;
  }
  if (icon) {
    return (
      <Avatar size={size || 32} shape="square" style={style}>
        <img src={icon} alt={script?.name} />
      </Avatar>
    );
  }
  return <></>;
}

import { useRef, useState } from "react";
import type { SCMetadata, Script } from "@App/app/repo/scripts";
import { Avatar, Button, Space, Tooltip } from "@arco-design/web-react";
import { IconBug, IconCode, IconGithub, IconHome } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { SystemConfigKey, SystemConfigValueType } from "@App/pkg/config/config";
import { systemConfig } from "@App/pages/store/global";
import { toCamelCase } from "@App/pkg/utils/utils";

// 安装url转home主页
export function installUrlToHome(installUrl: string) {
  try {
    // 解析scriptcat
    if (installUrl.includes("scriptcat.org")) {
      const id = installUrl.split("/")[5];
      return (
        <Button type="text" iconOnly size="small" target="_blank" href={`https://scriptcat.org/script-show-page/${id}`}>
          <img width={16} height={16} src="/assets/logo.png" alt="" />
        </Button>
      );
    }
    if (installUrl.includes("greasyfork.org")) {
      const id = installUrl.split("/")[4];
      return (
        <Button type="text" iconOnly size="small" target="_blank" href={`https://greasyfork.org/scripts/${id}`}>
          <img width={16} height={16} src="/assets/logo/gf.png" alt="" />
        </Button>
      );
    }
    if (installUrl.includes("raw.githubusercontent.com")) {
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
    if (installUrl.includes("github.com")) {
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
  script: { name: string; metadata: SCMetadata };
  size?: number;
  style?: React.CSSProperties;
};

export function ScriptIcons({ script, size = 32, style }: ScriptIconsProps) {
  style = style || {};
  style.display = style.display || "inline-block";
  style.marginRight = style.marginRight || "8px";
  const m = script.metadata;
  const [icon] = m.icon || m.iconurl || m.icon64 || m.icon64url || [];
  if (icon) {
    return (
      <Avatar size={size || 32} shape="square" style={style}>
        <img src={icon} alt={script?.name} />
      </Avatar>
    );
  }
  return <></>;
}

// 系统配置hooks
// 返回3个数组，第一个是值，第二个是设置值的函数，第三个提交值的函数
// key 为不变的字串值
export function useSystemConfig<T extends SystemConfigKey>(key: T) {
  const [value, setValue] = useState<SystemConfigValueType<T>>(() => {
    const defFnName = `default${toCamelCase(key)}`;
    const maybeFn = (systemConfig as any)[defFnName];
    const defVal =
      typeof maybeFn === "function"
        ? (maybeFn as () => SystemConfigValueType<T>)()
        : (undefined as SystemConfigValueType<T>);
    // 异步读取后setValue
    Promise.resolve(systemConfig.get(key)).then((v) => setValue(v));
    return defVal;
  });
  // 以 useRef 建立不变 submitValue
  const submitValue = useRef((v?: SystemConfigValueType<T>) => {
    if (v === undefined) {
      setValue((old) => {
        systemConfig.set(key, old);
        return old;
      });
    } else {
      systemConfig.set(key, v);
      setValue(v);
    }
  }).current;
  return [value as SystemConfigValueType<T>, setValue, submitValue] as const;
}

export function hashColor(text: string): string {
  if (!text) {
    return "gray"; // 默认颜色
  }
  // 预定义颜色
  const colors = [
    "red",
    "orangered",
    "orange",
    "gold",
    "lime",
    "green",
    "cyan",
    "arcoblue",
    "purple",
    "pinkpurple",
    "magenta",
    "gray",
  ];

  // 简单的哈希函数
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 转换为32位整数
  }

  // 确保哈希值为正数并取模得到颜色索引
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

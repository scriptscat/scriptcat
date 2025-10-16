import type { SCRIPT_STATUS } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import type { ScriptLoading } from "@App/pages/store/features/script";
import { Avatar, Button, Space, Switch, Tag, Tooltip } from "@arco-design/web-react";
import type { TFunction } from "i18next";
import React from "react";
import { TbWorldWww } from "react-icons/tb";

export const EnableSwitch = React.memo(
  ({
    status,
    enableLoading,
    ...props
  }: {
    status: SCRIPT_STATUS;
    enableLoading: boolean | undefined;
    [key: string]: any;
  }) => {
    return (
      <Switch checked={status === SCRIPT_STATUS_ENABLE} loading={enableLoading} disabled={enableLoading} {...props} />
    );
  },
  (prevProps, nextProps) => {
    return prevProps.status === nextProps.status && prevProps.enableLoading === nextProps.enableLoading;
  }
);
EnableSwitch.displayName = "EnableSwitch";

// Memoized Avatar component to prevent unnecessary re-renders
export const MemoizedAvatar = React.memo(
  ({ match, icon, website, ...rest }: { match: string; icon?: string; website?: string; [key: string]: any }) => (
    <Avatar
      shape="square"
      style={{
        backgroundColor: "unset",
        borderWidth: 1,
      }}
      className={website ? "cursor-pointer" : "cursor-default"}
      {...rest}
    >
      {icon ? <img title={match} src={icon} /> : <TbWorldWww title={match} color="#aaa" size={24} />}
    </Avatar>
  ),
  (prevProps, nextProps) => {
    return (
      prevProps.match === nextProps.match &&
      prevProps.icon === nextProps.icon &&
      prevProps.website === nextProps.website
    );
  }
);
MemoizedAvatar.displayName = "MemoizedAvatar";

// SourceCell component
export const SourceCell = React.memo(
  ({ item, t }: { item: ScriptLoading; t: TFunction }) => {
    if (item.subscribeUrl) {
      return (
        <Tooltip
          content={
            <p
              style={{ margin: 0, padding: 0 }}
            >{`${t("source_subscribe_link")}: ${decodeURIComponent(item.subscribeUrl)}`}</p>
          }
        >
          <Tag color="orange" bordered style={{ cursor: "pointer" }}>
            {t("source_subscribe_link")}
          </Tag>
        </Tooltip>
      );
    }
    if (!item.origin) {
      return (
        <Tooltip content={<p style={{ margin: 0, padding: 0 }}>{`${t("by_manual_creation")}`}</p>}>
          <Tag color="purple" bordered style={{ cursor: "pointer" }}>
            {t("source_local_script")}
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tooltip
        content={
          <p style={{ margin: 0, padding: 0 }}>{`${t("source_script_link")}: ${decodeURIComponent(item.origin)}`}</p>
        }
      >
        <Tag color="green" bordered style={{ cursor: "pointer" }}>
          {t("source_script_link")}
        </Tag>
      </Tooltip>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.item.subscribeUrl === nextProps.item.subscribeUrl && prevProps.item.origin === nextProps.item.origin
    );
  }
);
SourceCell.displayName = "SourceCell";

// HomeCell component
export const HomeCell = React.memo(({ item }: { item: ScriptLoading }) => {
  const homepage = item.metadata.homepage?.[0];
  const supportUrl = item.metadata.supportUrl?.[0];

  if (!homepage && !supportUrl) {
    return null;
  }

  return (
    <Space size={8}>
      {homepage && (
        <Button type="text" size="mini" onClick={() => window.open(homepage, "_blank")} style={{ padding: "0 4px" }}>
          {"主页"}
        </Button>
      )}
      {supportUrl && (
        <Button type="text" size="mini" onClick={() => window.open(supportUrl, "_blank")} style={{ padding: "0 4px" }}>
          {"反馈"}
        </Button>
      )}
    </Space>
  );
});
HomeCell.displayName = "HomeCell";

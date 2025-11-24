import type { SCRIPT_STATUS } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE } from "@App/app/repo/scripts";
import { scriptClient, type ScriptLoading } from "@App/pages/store/features/script";
import { Avatar, Input, Message, Select, Space, Switch, Tag, Tooltip } from "@arco-design/web-react";
import React from "react";
import Text from "@arco-design/web-react/es/Typography/text";
import { TbWorldWww } from "react-icons/tb";
import { semTime } from "@App/pkg/utils/dayjs";
import { useTranslation } from "react-i18next";
import { ListHomeRender } from "../utils";
import { IconEdit, IconLink, IconUserAdd } from "@arco-design/web-react/icon";
import type { SearchType } from "@App/app/service/service_worker/types";
import type { TFunction } from "i18next";
import type { RefInputType } from "@arco-design/web-react/es/Input";

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

export const SourceCell = React.memo(
  ({ item, t }: { item: ScriptLoading; t: any }) => {
    if (item.subscribeUrl) {
      return (
        <Tooltip
          content={
            <p
              style={{ margin: 0, padding: 0 }}
            >{`${t("source_subscribe_link")}: ${decodeURIComponent(item.subscribeUrl)}`}</p>
          }
        >
          <Tag
            icon={<IconLink />}
            color="orange"
            bordered
            style={{
              cursor: "pointer",
            }}
          >
            {t("source_subscribe_link")}
          </Tag>
        </Tooltip>
      );
    }
    if (!item.origin) {
      return (
        <Tooltip content={<p style={{ margin: 0, padding: 0 }}>{`${t("by_manual_creation")}`}</p>}>
          <Tag
            icon={<IconEdit />}
            color="purple"
            bordered
            style={{
              cursor: "pointer",
            }}
          >
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
        <Tag
          icon={<IconUserAdd color="" />}
          color="green"
          bordered
          style={{
            cursor: "pointer",
          }}
        >
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

export const HomeCell = React.memo(({ item }: { item: ScriptLoading }) => {
  return <ListHomeRender script={item} />;
});
HomeCell.displayName = "HomeCell";

export const UpdateTimeCell = React.memo(({ className, script }: { className?: string; script: ScriptLoading }) => {
  const { t } = useTranslation();
  const { handleClick } = {
    handleClick: () => {
      if (!script.checkUpdateUrl) {
        Message.warning(t("update_not_supported")!);
        return;
      }
      Message.info({
        id: "checkupdate",
        content: t("checking_for_updates"),
      });
      scriptClient
        .requestCheckUpdate(script.uuid)
        .then((res) => {
          if (res) {
            Message.warning({
              id: "checkupdate",
              content: t("new_version_available"),
            });
          } else {
            Message.success({
              id: "checkupdate",
              content: t("latest_version"),
            });
          }
        })
        .catch((e) => {
          Message.error({
            id: "checkupdate",
            content: `${t("update_check_failed")}: ${e.message}`,
          });
        });
    },
  };

  return (
    <Tooltip content={t("check_update")} position="tl">
      <Text
        className={className}
        style={{
          cursor: "pointer",
        }}
        onClick={handleClick}
      >
        {script.updatetime && semTime(new Date(script.updatetime))}
      </Text>
    </Tooltip>
  );
});
UpdateTimeCell.displayName = "UpdateTimeCell";

interface ScriptSearchFieldProps {
  t: TFunction<"translation", undefined>;
  defaultValue: { keyword: string; type: SearchType };
  onSearch?: (req: { keyword: string; type: SearchType }) => void;
  inputRef?: React.RefObject<RefInputType>;
}

export const ScriptSearchField = React.memo(
  ({ t, defaultValue, onSearch, inputRef }: ScriptSearchFieldProps) => {
    const [keyword, setKeyword] = React.useState(defaultValue?.keyword || "");
    const [type, setType] = React.useState<SearchType>(defaultValue?.type || "auto");
    return (
      <Space direction="horizontal">
        <Select
          className="flex-1"
          triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
          size="small"
          value={type}
          onChange={(value) => {
            setType(value as SearchType);
            onSearch?.({ keyword, type: value as SearchType });
          }}
        >
          <Select.Option value="auto">{t("auto")}</Select.Option>
          <Select.Option value="name">{t("name")}</Select.Option>
          <Select.Option value="script_code">{t("script_code")}</Select.Option>
        </Select>
        <Input.Search
          ref={inputRef}
          size="small"
          searchButton
          style={{ maxWidth: 400 }}
          value={keyword}
          placeholder={t("enter_search_value", { search: `${t("name")}/${t("script_code")}` })!}
          onChange={(value) => {
            setKeyword(value);
          }}
          onSearch={(value) => {
            onSearch?.({ keyword: value, type });
          }}
        />
      </Space>
    );
  },
  (prevProps, nextProps) => {
    return prevProps.t === nextProps.t;
  }
);
ScriptSearchField.displayName = "ScriptSearchField";

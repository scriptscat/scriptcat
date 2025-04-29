import React, { useEffect, useRef, useState } from "react";
import Text from "@arco-design/web-react/es/Typography/text";
import { Button, Card, Input, Message, Popconfirm, Switch, Table, Tag, Tooltip } from "@arco-design/web-react";
import { Subscribe, SUBSCRIBE_STATUS_DISABLE, SUBSCRIBE_STATUS_ENABLE, SubscribeDAO } from "@App/app/repo/subscribe";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import { IconSearch, IconUserAdd } from "@arco-design/web-react/icon";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import { semTime } from "@App/pkg/utils/utils";
import { RiDeleteBin5Fill } from "react-icons/ri";
import { useTranslation } from "react-i18next"; // 添加了 react-i18next 的引用
import { subscribeClient } from "@App/pages/store/features/script";

type ListType = Subscribe & { loading?: boolean };

function SubscribeList() {
  const dao = new SubscribeDAO();
  const [list, setList] = useState<ListType[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const { t } = useTranslation(); // 使用 useTranslation hook

  useEffect(() => {
    dao.all().then((subscribes) => {
      setList(subscribes);
    });
  }, []);

  const columns: ColumnProps[] = [
    {
      title: "#",
      dataIndex: "id",
      width: 70,
      key: "#",
      sorter: (a: Subscribe, b) => a.createtime - b.createtime,
      render(col) {
        if (col < 0) {
          return "-";
        }
        return col + 1;
      },
    },
    {
      title: t("enable"),
      width: t("subscribe_list_enable_width"),
      key: "enable",
      sorter(a, b) {
        return a.status - b.status;
      },
      filters: [
        {
          text: t("enable"),
          value: SUBSCRIBE_STATUS_ENABLE,
        },
        {
          text: t("disable"),
          value: SUBSCRIBE_STATUS_DISABLE,
        },
      ],
      onFilter: (value, row) => row.status === value,
      render: (col, item: ListType, index) => {
        return (
          <Switch
            checked={item.status === SUBSCRIBE_STATUS_ENABLE}
            loading={item.loading}
            disabled={item.loading}
            onChange={(checked) => {
              list[index].loading = true;
              setList([...list]);
              subscribeClient
                .enable(item.url, checked)
                .then(() => {
                  list[index].status = checked ? SUBSCRIBE_STATUS_ENABLE : SUBSCRIBE_STATUS_DISABLE;
                })
                .catch((err) => {
                  Message.error(err);
                })
                .finally(() => {
                  list[index].loading = false;
                  setList([...list]);
                });
            }}
          />
        );
      },
    },
    {
      title: t("name"),
      dataIndex: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
      filterIcon: <IconSearch />,
      key: "name",
      // eslint-disable-next-line react/no-unstable-nested-components
      filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
        return (
          <div className="arco-table-custom-filter">
            <Input.Search
              ref={inputRef}
              searchButton
              placeholder={t("enter_subscribe_name")!}
              value={filterKeys[0] || ""}
              onChange={(value) => {
                setFilterKeys(value ? [value] : []);
              }}
              onSearch={() => {
                confirm();
              }}
            />
          </div>
        );
      },
      onFilter: (value, row) => (value ? row.name.indexOf(value) !== -1 : true),
      onFilterDropdownVisibleChange: (visible) => {
        if (visible) {
          setTimeout(() => inputRef.current!.focus(), 150);
        }
      },
      className: "max-w-[240px]",
      render: (col) => {
        return (
          <Tooltip content={col} position="tl">
            <Text
              style={{
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {col}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: t("version"),
      dataIndex: "version",
      width: 120,
      align: "center",
      key: "version",
      render(col, item: Subscribe) {
        return item.metadata.version && item.metadata.version[0];
      },
    },
    {
      title: t("permission"),
      width: 120,
      align: "center",
      key: "permission",
      render(_, item: Subscribe) {
        if (item.metadata.connect) {
          return <div />;
        }
        return (item.metadata.connect as string[]).map((val) => {
          return <img src={`https://${val}/favicon.ico`} alt={val} height={16} width={16} />;
        });
      },
    },
    {
      title: t("source"),
      width: 100,
      align: "center",
      key: "source",
      render(_, item: Subscribe) {
        return (
          <Tooltip
            content={
              <p style={{ margin: 0, padding: 0 }}>
                {t("subscribe_url")}: {decodeURIComponent(item.url)}
              </p>
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
              {t("subscribe_url")}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t("last_updated"),
      dataIndex: "updatetime",
      align: "center",
      key: "updatetime",
      width: t("script_list_last_updated_width"),
      sorter: (a, b) => a.updatetime - b.updatetime,
      render(col, subscribe: Subscribe) {
        return (
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
          <span
            style={{
              cursor: "pointer",
            }}
            onClick={() => {
              Message.info({
                id: "checkupdate",
                content: t("checking_for_updates"),
              });
              subscribeClient
                .checkUpdate(subscribe.url)
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
                    content: `${t("check_update_failed")}: ${e.message}`,
                  });
                });
            }}
          >
            {semTime(new Date(col))}
          </span>
        );
      },
    },
    {
      title: t("action"),
      width: 120,
      align: "center",
      key: "action",
      render(_, item: Subscribe) {
        return (
          <Button.Group>
            <Popconfirm
              title={t("confirm_delete_subscription")}
              icon={<RiDeleteBin5Fill />}
              onOk={() => {
                subscribeClient
                  .delete(item.url)
                  .then(() => {
                    setList(list.filter((val) => val.url !== item.url));
                    Message.success(t("delete_success"));
                  })
                  .catch((e) => {
                    Message.error(`${t("delete_failed")}: ${e}`);
                  });
              }}
            >
              <Button
                type="text"
                icon={<RiDeleteBin5Fill />}
                onClick={() => {}}
                style={{
                  color: "var(--color-text-2)",
                }}
              />
            </Popconfirm>
          </Button.Group>
        );
      },
    },
  ];

  return (
    <Card
      className="script-list subscribe-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <Table
        className="arco-drag-table-container"
        rowKey="id"
        tableLayoutFixed
        columns={columns}
        data={list}
        pagination={{
          total: list.length,
          pageSize: list.length,
          hideOnSinglePage: true,
        }}
        style={{
          minWidth: "1100px",
        }}
      />
    </Card>
  );
}

export default SubscribeList;

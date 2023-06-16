import React, { useEffect, useRef, useState } from "react";
import Text from "@arco-design/web-react/es/Typography/text";
import {
  Button,
  Card,
  Input,
  Message,
  Popconfirm,
  Switch,
  Table,
  Tag,
  Tooltip,
} from "@arco-design/web-react";
import {
  Subscribe,
  SUBSCRIBE_STATUS_DISABLE,
  SUBSCRIBE_STATUS_ENABLE,
  SubscribeDAO,
} from "@App/app/repo/subscribe";
import { ColumnProps } from "@arco-design/web-react/es/Table";
import IoC from "@App/app/ioc";
import SubscribeController from "@App/app/service/subscribe/controller";
import { IconSearch, IconUserAdd } from "@arco-design/web-react/icon";
import { RefInputType } from "@arco-design/web-react/es/Input/interface";
import { semTime } from "@App/pkg/utils/utils";
import { RiDeleteBin5Fill } from "react-icons/ri";
import { useTranslation } from "react-i18next"; // 添加了 react-i18next 的引用

type ListType = Subscribe & { loading?: boolean };

function SubscribeList() {
  const dao = new SubscribeDAO();
  const subscribeCtrl = IoC.instance(
    SubscribeController
  ) as SubscribeController;
  const [list, setList] = useState<ListType[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const { t } = useTranslation(); // 使用 useTranslation hook

  useEffect(() => {
    dao.table
      .orderBy("id")
      .toArray()
      .then((subscribes) => {
        setList(subscribes);
      });
  }, []);

  const columns: ColumnProps[] = [
    {
      title: "#",
      dataIndex: "id",
      width: 70,
      key: "#",
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: t("enable"),
      width: 100,
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
              let p: Promise<any>;
              if (checked) {
                p = subscribeCtrl.enable(item.id).then(() => {
                  list[index].status = SUBSCRIBE_STATUS_ENABLE;
                });
              } else {
                p = subscribeCtrl.disable(item.id).then(() => {
                  list[index].status = SUBSCRIBE_STATUS_DISABLE;
                });
              }
              p.catch((err) => {
                Message.error(err);
              }).finally(() => {
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
          return (
            <img
              src={`https://${val}/favicon.ico`}
              alt={val}
              height={16}
              width={16}
            />
          );
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
      width: 100,
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
                content: t("checking_update"),
              });
              subscribeCtrl
                .checkUpdate(subscribe.id)
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
                setList(list.filter((val) => val.id !== item.id));
                subscribeCtrl.delete(item.id).catch((e) => {
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
      className="script-list"
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

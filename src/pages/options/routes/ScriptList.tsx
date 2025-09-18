import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Divider,
  Dropdown,
  Input,
  Menu,
  Message,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "@arco-design/web-react";
import { TbWorldWww } from "react-icons/tb";
import { messageQueue } from "@App/pages/store/global";
import type { ColumnProps } from "@arco-design/web-react/es/Table";
import type { ComponentsProps } from "@arco-design/web-react/es/Table/interface";
import type { Script, UserConfig } from "@App/app/repo/scripts";
import {
  type SCRIPT_STATUS,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_NORMAL,
  ScriptDAO,
} from "@App/app/repo/scripts";
import {
  IconClockCircle,
  IconDragDotVertical,
  IconEdit,
  IconLink,
  IconSearch,
  IconUserAdd,
} from "@arco-design/web-react/icon";
import {
  RiDeleteBin5Fill,
  RiPencilFill,
  RiPlayFill,
  RiSettings3Fill,
  RiStopFill,
  RiUploadCloudFill,
} from "react-icons/ri";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { RefInputType } from "@arco-design/web-react/es/Input/interface";
import Text from "@arco-design/web-react/es/Typography/text";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import UserConfigPanel from "@App/pages/components/UserConfigPanel";
import CloudScriptPlan from "@App/pages/components/CloudScriptPlan";
import { useTranslation } from "react-i18next";
import { nextTime } from "@App/pkg/utils/cron";
import { semTime } from "@App/pkg/utils/dayjs";
import { message, systemConfig } from "@App/pages/store/global";
import { i18nName } from "@App/locales/locales";
import { ListHomeRender, ScriptIcons } from "./utils";
import { useAppDispatch } from "@App/pages/store/hooks";
import type { ScriptLoading } from "@App/pages/store/features/script";
import {
  requestEnableScript,
  requestDeleteScripts,
  sortScript,
  pinToTop,
  requestStopScript,
  requestRunScript,
  scriptClient,
  synchronizeClient,
  requestFilterResult,
  fetchScriptList,
  fetchScript,
} from "@App/pages/store/features/script";
import { ValueClient } from "@App/app/service/service_worker/client";
import { loadScriptFavicons } from "@App/pages/store/utils";
import type { SearchType } from "@App/app/service/service_worker/types";
import type {
  TDeleteScript,
  TEnableScript,
  TInstallScript,
  TScriptRunStatus,
  TSortedScript,
} from "@App/app/service/queue";

type ListType = ScriptLoading;
type RowCtx = ReturnType<typeof useSortable> | null;
const SortableRowCtx = createContext<RowCtx>(null);

// Create context for DraggableContainer
interface DraggableContextType {
  sensors: ReturnType<typeof useSensors>;
  scriptList: ScriptLoading[];
  setScriptList: React.Dispatch<React.SetStateAction<ScriptLoading[]>>;
  dispatch: ReturnType<typeof useAppDispatch>;
}
const DraggableContext = createContext<DraggableContextType | null>(null);

// Memoized Avatar component to prevent unnecessary re-renders
const MemoizedAvatar = React.memo(
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
  )
);
MemoizedAvatar.displayName = "MemoizedAvatar";

function composeRefs<T>(...refs: React.Ref<T>[]): (node: T | null) => void {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<T | null>).current = node;
      }
    }
  };
}

const DraggableRow = React.memo(
  React.forwardRef<HTMLTableRowElement, { record: any; index: any } & React.HTMLAttributes<HTMLTableRowElement>>(
    ({ record, index: _index, ...rest }, ref) => {
      const sortable = useSortable({ id: record.uuid });
      const { setNodeRef, transform, transition } = sortable;

      const style = {
        transform: CSS.Transform.toString(transform),
        transition,
      };

      return (
        <SortableRowCtx.Provider value={sortable}>
          <tr ref={composeRefs(setNodeRef, ref)} style={style} {...rest} />
        </SortableRowCtx.Provider>
      );
    }
  )
);
DraggableRow.displayName = "DraggableRow";

const DragHandle = () => {
  const sortable = useContext(SortableRowCtx);

  if (!sortable)
    return (
      <IconDragDotVertical
        style={{
          cursor: "move",
        }}
      />
    );

  const { listeners, setActivatorNodeRef } = sortable;

  return (
    <IconDragDotVertical
      {...listeners}
      ref={setActivatorNodeRef}
      style={{
        cursor: "move",
      }}
    />
  );
};

// 提取render函数以避免每次渲染时重新创建
const SortRender = React.memo(({ col }: { col: number }) => {
  if (col < 0) {
    return "-";
  }
  return col + 1;
});
SortRender.displayName = "SortRender";

const EnableSwitchCell = React.memo(({ item, updateScriptList }: { item: ScriptLoading; updateScriptList: any }) => {
  const { uuid } = item;
  const onChange = React.useCallback(
    (checked: boolean) => {
      updateScriptList({ uuid: uuid, enableLoading: true });
      requestEnableScript({ uuid: uuid, enable: checked });
    },
    [uuid, updateScriptList]
  );

  return <EnableSwitch status={item.status} enableLoading={item.enableLoading} onChange={onChange} />;
});
EnableSwitchCell.displayName = "EnableSwitchCell";

const NameCell = React.memo(({ col, item }: { col: string; item: ListType }) => {
  return (
    <Tooltip content={col} position="tl">
      <Link
        to={`/script/editor/${item.uuid}`}
        style={{
          textDecoration: "none",
        }}
      >
        <Text
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: "20px",
          }}
        >
          <ScriptIcons script={item} size={20} />
          {i18nName(item)}
        </Text>
      </Link>
    </Tooltip>
  );
});
NameCell.displayName = "NameCell";

const VersionCell = React.memo(({ item }: { item: ListType }) => {
  return item.metadata.version && item.metadata.version[0];
});
VersionCell.displayName = "VersionCell";

const ApplyToRunStatusCell = React.memo(({ item, navigate, t }: { item: ListType; navigate: any; t: any }) => {
  const toLogger = React.useCallback(() => {
    navigate({
      pathname: "logger",
      search: `query=${encodeURIComponent(
        JSON.stringify([
          { key: "uuid", value: item.uuid },
          {
            key: "component",
            value: "GM_log",
          },
        ])
      )}`,
    });
  }, [item.uuid, navigate]);

  if (item.type === SCRIPT_TYPE_NORMAL) {
    return (
      <>
        <Avatar.Group size={20}>
          {item.favorite &&
            [...item.favorite]
              .sort((a, b) => {
                if (a.icon && !b.icon) return -1;
                if (!a.icon && b.icon) return 1;
                return a.match.localeCompare(b.match);
              })
              .slice(0, 4)
              .map((fav) => (
                <MemoizedAvatar
                  key={`${fav.match}_${fav.icon}_${fav.website}`}
                  {...fav}
                  onClick={() => {
                    if (fav.website) {
                      window.open(fav.website, "_blank");
                    }
                  }}
                />
              ))}
          {item.favorite && item.favorite.length > 4 && "..."}
        </Avatar.Group>
      </>
    );
  }
  let tooltip = "";
  if (item.type === SCRIPT_TYPE_BACKGROUND) {
    tooltip = t("background_script_tooltip");
  } else {
    tooltip = `${t("scheduled_script_tooltip")} ${nextTime(item.metadata!.crontab![0])}`;
  }
  return (
    <>
      <Tooltip content={tooltip}>
        <Tag
          icon={<IconClockCircle />}
          color="blue"
          bordered
          style={{
            cursor: "pointer",
          }}
          onClick={toLogger}
        >
          {item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? t("running") : t("completed")}
        </Tag>
      </Tooltip>
    </>
  );
});
ApplyToRunStatusCell.displayName = "ApplyToRunStatusCell";

const SourceCell = React.memo(({ item, t }: { item: ListType; t: any }) => {
  if (item.subscribeUrl) {
    return (
      <Tooltip
        content={<p style={{ margin: 0 }}>{`${t("subscription_link")}: ${decodeURIComponent(item.subscribeUrl)}`}</p>}
      >
        <Tag
          icon={<IconLink />}
          color="orange"
          bordered
          style={{
            cursor: "pointer",
          }}
        >
          {t("subscription_installation")}
        </Tag>
      </Tooltip>
    );
  }
  if (!item.origin) {
    return (
      <Tag
        icon={<IconEdit />}
        color="purple"
        bordered
        style={{
          cursor: "pointer",
        }}
      >
        {t("manually_created")}
      </Tag>
    );
  }
  return (
    <Tooltip
      content={<p style={{ margin: 0, padding: 0 }}>{`${t("script_link")}: ${decodeURIComponent(item.origin)}`}</p>}
    >
      <Tag
        icon={<IconUserAdd color="" />}
        color="green"
        bordered
        style={{
          cursor: "pointer",
        }}
      >
        {t("user_installation")}
      </Tag>
    </Tooltip>
  );
});
SourceCell.displayName = "SourceCell";

const HomeCell = React.memo(({ item }: { item: ListType }) => {
  return <ListHomeRender script={item} />;
});
HomeCell.displayName = "HomeCell";

const UpdateTimeCell = React.memo(({ col, script, t }: { col: number; script: ListType; t: any }) => {
  const handleClick = React.useCallback(() => {
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
  }, [script.checkUpdateUrl, script.uuid, t]);

  return (
    <Tooltip content={t("check_update")} position="tl">
      <Text
        style={{
          cursor: "pointer",
        }}
        onClick={handleClick}
      >
        {semTime(new Date(col))}
      </Text>
    </Tooltip>
  );
});
UpdateTimeCell.displayName = "UpdateTimeCell";

const ActionCell = React.memo(
  ({
    item,
    updateScriptList,
    updateEntry,
    setUserConfig,
    setCloudScript,
    t,
  }: {
    item: ScriptLoading;
    updateScriptList: any;
    updateEntry: any;
    setUserConfig: any;
    setCloudScript: any;
    t: any;
  }) => {
    const handleDelete = React.useCallback(() => {
      const { uuid } = item;
      updateScriptList({ uuid, actionLoading: true });
      requestDeleteScripts([item.uuid]);
    }, [item, updateScriptList]);

    const handleConfig = React.useCallback(() => {
      new ValueClient(message).getScriptValue(item).then((newValues) => {
        setUserConfig({
          userConfig: { ...item.config! },
          script: item,
          values: newValues,
        });
      });
    }, [item, setUserConfig]);

    const handleRunStop = React.useCallback(async () => {
      if (item.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
        // Stop script
        Message.loading({
          id: "script-stop",
          content: t("stopping_script"),
        });
        updateEntry([item.uuid], { actionLoading: true });
        await requestStopScript(item.uuid);
        updateEntry([item.uuid], { actionLoading: false });
        Message.success({
          id: "script-stop",
          content: t("script_stopped"),
          duration: 3000,
        });
      } else {
        Message.loading({
          id: "script-run",
          content: t("starting_script"),
        });
        updateEntry([item.uuid], { actionLoading: true });
        await requestRunScript(item.uuid);
        updateEntry([item.uuid], { actionLoading: false });
        Message.success({
          id: "script-run",
          content: t("script_started"),
          duration: 3000,
        });
      }
    }, [item, updateEntry, t]);

    const handleCloud = React.useCallback(() => {
      setCloudScript(item);
    }, [item, setCloudScript]);

    return (
      <Button.Group>
        <Link to={`/script/editor/${item.uuid}`}>
          <Button
            type="text"
            icon={<RiPencilFill />}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        </Link>
        <Popconfirm title={t("confirm_delete_script")} icon={<RiDeleteBin5Fill />} onOk={handleDelete}>
          <Button
            type="text"
            icon={<RiDeleteBin5Fill />}
            loading={item.actionLoading}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        </Popconfirm>
        {item.config && (
          <Button
            type="text"
            icon={<RiSettings3Fill />}
            onClick={handleConfig}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
        {item.type !== SCRIPT_TYPE_NORMAL && (
          <Button
            type="text"
            icon={item.runStatus === SCRIPT_RUN_STATUS_RUNNING ? <RiStopFill /> : <RiPlayFill />}
            loading={item.actionLoading}
            onClick={handleRunStop}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
        {item.metadata.cloudcat && (
          <Button
            type="text"
            icon={<RiUploadCloudFill />}
            onClick={handleCloud}
            style={{
              color: "var(--color-text-2)",
            }}
          />
        )}
      </Button.Group>
    );
  }
);
ActionCell.displayName = "ActionCell";

const scriptListSortOrder = (
  scripts: ScriptLoading[],
  setScriptList: React.Dispatch<React.SetStateAction<ScriptLoading[]>>,
  { active, over }: { active: string; over: string }
) => {
  let oldIndex = -1;
  let newIndex = -1;
  scripts.forEach((item, index) => {
    if (item.uuid === active) {
      oldIndex = index;
    } else if (item.uuid === over) {
      newIndex = index;
    }
  });
  if (oldIndex >= 0 && newIndex >= 0) {
    const newItems = arrayMove(scripts, oldIndex, newIndex);
    for (let i = 0, l = newItems.length; i < l; i += 1) {
      if (newItems[i].sort !== i) {
        newItems[i].sort = i;
      }
    }
    setScriptList(newItems);
  }
  sortScript({ active, over });
};

const DraggableContainer = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  (props, ref) => {
    const context = useContext(DraggableContext);
    if (!context) return <></>;
    const { sensors, scriptList, setScriptList } = context;
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{ container: document.body }}
        onDragEnd={(event: DragEndEvent) => {
          const { active, over } = event;
          if (!over) {
            return;
          }
          if (active.id !== over.id) {
            scriptListSortOrder(scriptList, setScriptList, { active: active.id as string, over: over.id as string });
          }
        }}
      >
        <SortableContext items={scriptList.map((s) => ({ ...s, id: s.uuid }))} strategy={verticalListSortingStrategy}>
          <tbody ref={ref} {...props} />
        </SortableContext>
      </DndContext>
    );
  }
);

DraggableContainer.displayName = "DraggableContainer";

const EnableSwitch = React.memo(
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
  }
);
EnableSwitch.displayName = "EnableSwitch";

function ScriptList() {
  const [userConfig, setUserConfig] = useState<{
    script: Script;
    userConfig: UserConfig;
    values: { [key: string]: any };
  }>();
  const [cloudScript, setCloudScript] = useState<Script>();
  const dispatch = useAppDispatch();
  const [mInitial, setInitial] = useState<boolean>(false);
  const [scriptList, setScriptList] = useState<ScriptLoading[]>([]);
  const inputRef = useRef<RefInputType>(null);
  const navigate = useNavigate();
  const openUserConfig = useSearchParams()[0].get("userConfig") || "";
  const [showAction, setShowAction] = useState(false);
  const [action, setAction] = useState("");
  const [select, setSelect] = useState<Script[]>([]);
  const [selectColumn, setSelectColumn] = useState(0);
  const [savedWidths, setSavedWidths] = useState<{ [key: string]: number } | null>(null);
  const { t } = useTranslation();

  const filterCache: Map<string, any> = new Map<string, any>();

  const setFilterCache = (res: Partial<Record<string, any>>[] | null) => {
    filterCache.clear();
    if (res === null) return;
    for (const entry of res) {
      filterCache.set(entry.uuid, {
        code: entry.code === true,
        name: entry.name === true,
        auto: entry.auto === true,
      });
    }
  };

  // 处理拖拽排序
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // Provide context for DraggableContainer
  const draggableContextValue = useMemo(
    () => ({
      sensors,
      scriptList,
      setScriptList,
      dispatch,
    }),
    [sensors, scriptList, setScriptList, dispatch]
  );

  const doInitial = async () => {
    setInitial(true);
    const list = await fetchScriptList();
    setScriptList(list);

    for await (const { chunkResults } of loadScriptFavicons(list)) {
      setScriptList((list) => {
        const scriptMap = new Map<string, ScriptLoading>();
        for (const s of list) {
          scriptMap.set(s.uuid, s);
        }
        const altered = new Set();
        for (const item of chunkResults) {
          const script = scriptMap.get(item.uuid);
          if (script) {
            altered.add(item.uuid);
            script.favorite = item.fav;
          }
        }
        return list.map((entry) => (altered.has(entry.uuid) ? { ...entry } : entry));
      });
    }
  };

  mInitial === false && doInitial();

  const pageApi = {
    scriptRunStatus(data: TScriptRunStatus) {
      const { uuid, runStatus } = data;
      setScriptList((list: ScriptLoading[]) => {
        const index = list.findIndex((s) => s.uuid === uuid);
        if (index === -1) return list;

        const newList = [...list];
        newList[index] = { ...list[index], runStatus };
        return newList;
      });
    },

    async installScript(message: TInstallScript) {
      const installedScript = await fetchScript(message.script.uuid);
      if (!installedScript) return;
      const installedScriptUUID = installedScript.uuid;
      if (!installedScriptUUID) return;

      setScriptList((list: ScriptLoading[]) => {
        const existingIndex = list.findIndex((s) => s.uuid === installedScriptUUID);
        if (existingIndex !== -1) {
          const newList = [...list];
          newList[existingIndex] = { ...list[existingIndex], ...installedScript };
          return newList;
        }

        // 放到第一
        const res = [{ ...installedScript }, ...list];
        for (let i = 0, l = res.length; i < l; i++) {
          res[i].sort = i;
        }
        return res;
      });
    },

    deleteScripts(data: TDeleteScript[]) {
      const uuids = data.map(({ uuid }) => uuid);
      const set = new Set(uuids);
      setScriptList((list: ScriptLoading[]) => {
        const res = list.filter((s) => !set.has(s.uuid));
        for (let i = 0, l = res.length; i < l; i++) {
          res[i].sort = i;
        }
        return res;
      });
    },

    enableScripts(data: TEnableScript[]) {
      const map = new Map();
      for (const { uuid, enable } of data) {
        map.set(uuid, enable);
      }

      setScriptList((list: ScriptLoading[]) => {
        let hasChanges = false;
        const newList = list.map((script) => {
          if (map.has(script.uuid)) {
            hasChanges = true;
            const enable = map.get(script.uuid);
            return {
              ...script,
              enableLoading: false,
              status: enable ? SCRIPT_STATUS_ENABLE : SCRIPT_STATUS_DISABLE,
            };
          }
          return script;
        });

        return hasChanges ? newList : list;
      });
    },

    sortedScripts(data: TSortedScript[]) {
      setScriptList((list: ScriptLoading[]) => {
        const listEntries = new Map<string, ScriptLoading>();
        for (const item of list) {
          listEntries.set(item.uuid, item);
        }
        let j = 0;
        const res = new Array(data.length);
        for (const { uuid } of data) {
          const item = listEntries.get(uuid);
          if (item) {
            res[j] = item;
            item.sort = j;
            j++;
          }
        }
        res.length = j;
        return res;
      });
    },
  };

  const subscribeMessageConsumed = new WeakSet();
  const subscribeMessage = (topic: string, handler: (msg: any) => void) => {
    return messageQueue.subscribe<any>(topic, (data: any) => {
      const message = data?.myMessage || data;
      if (typeof message === "object" && !subscribeMessageConsumed.has(message)) {
        subscribeMessageConsumed.add(message);
        handler(message);
      }
    });
  };

  useEffect(() => {
    const unhooks = [
      subscribeMessage("scriptRunStatus", pageApi.scriptRunStatus),
      subscribeMessage("installScript", pageApi.installScript),
      subscribeMessage("deleteScripts", pageApi.deleteScripts),
      subscribeMessage("enableScripts", pageApi.enableScripts),
      subscribeMessage("sortedScripts", pageApi.sortedScripts),
    ];
    return () => {
      for (const unhook of unhooks) unhook();
    };
  });

  const updateScriptList = React.useCallback((data: Partial<Script | ScriptLoading>) => {
    setScriptList((list) => {
      const index = list.findIndex((script) => script.uuid === data.uuid);
      if (index === -1) return list;

      const newList = [...list];
      newList[index] = { ...list[index], ...data };
      return newList;
    });
  }, []);

  const updateEntry = React.useCallback((uuids: string[], data: Partial<Script | ScriptLoading>) => {
    const set = new Set(uuids);
    setScriptList((list) => {
      let hasChanges = false;
      const newList = list.map((script) => {
        if (set.has(script.uuid)) {
          hasChanges = true;
          return { ...script, ...data };
        }
        return script;
      });

      return hasChanges ? newList : list;
    });
  }, []);

  // 创建稳定的render函数引用
  const renderSort = React.useCallback((col: number) => <SortRender col={col} />, []);
  const renderEnableSwitch = React.useCallback(
    (col: any, item: ScriptLoading) => <EnableSwitchCell item={item} updateScriptList={updateScriptList} />,
    [updateScriptList]
  );
  const renderName = React.useCallback((col: string, item: ListType) => <NameCell col={col} item={item} />, []);
  const renderVersion = React.useCallback((col: any, item: ListType) => <VersionCell item={item} />, []);
  const renderApplyToRunStatus = React.useCallback(
    (col: any, item: ListType) => <ApplyToRunStatusCell item={item} navigate={navigate} t={t} />,
    [navigate, t]
  );
  const renderSource = React.useCallback((col: any, item: ListType) => <SourceCell item={item} t={t} />, [t]);
  const renderHome = React.useCallback((col: any, item: ListType) => <HomeCell item={item} />, []);
  const renderUpdateTime = React.useCallback(
    (col: number, script: ListType) => <UpdateTimeCell col={col} script={script} t={t} />,
    [t]
  );
  const renderAction = React.useCallback(
    (col: any, item: ScriptLoading) => (
      <ActionCell
        item={item}
        updateScriptList={updateScriptList}
        updateEntry={updateEntry}
        setUserConfig={setUserConfig}
        setCloudScript={setCloudScript}
        t={t}
      />
    ),
    [updateScriptList, updateEntry, setUserConfig, setCloudScript, t]
  );

  const columns: ColumnProps[] = useMemo(
    () =>
      [
        {
          title: "#",
          dataIndex: "sort",
          width: 60,
          key: "#",
          sorter: (a, b) => a.sort - b.sort,
          render: renderSort,
        },
        {
          key: "title",
          title: t("enable"),
          width: t("script_list_enable_width"),
          dataIndex: "status",
          className: "script-enable",
          sorter(a, b) {
            return a.status - b.status;
          },
          filters: [
            {
              text: t("enable"),
              value: SCRIPT_STATUS_ENABLE,
            },
            {
              text: t("disable"),
              value: SCRIPT_STATUS_DISABLE,
            },
          ],
          onFilter: (value, row) => row.status === value,
          render: renderEnableSwitch,
        },
        {
          key: "name",
          title: t("name"),
          dataIndex: "name",
          sorter: (a, b) => a.name.localeCompare(b.name),
          filterIcon: <IconSearch />,
          filterDropdown: ({ filterKeys, setFilterKeys, confirm }: any) => {
            if (!filterKeys.length) {
              filterKeys = [{ type: "auto", value: "" }];
            }
            return (
              <div className="arco-table-custom-filter flex flex-row gap-2">
                <Select
                  className="flex-1"
                  triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
                  size="small"
                  value={filterKeys[0].type || "auto"}
                  onChange={(value) => {
                    if (value !== filterKeys[0].type) {
                      filterKeys[0].type = value;
                      if (!filterKeys[0].value) {
                        setFilterCache(null);
                        setFilterKeys([...filterKeys]);
                        return;
                      }
                      requestFilterResult({ type: value, value: filterKeys[0].value }).then((res) => {
                        if (filterKeys[0].type !== value) return;
                        setFilterCache(res as any);
                        setFilterKeys([...filterKeys]);
                      });
                    }
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
                  style={{ minWidth: 240 }}
                  placeholder={
                    t("enter_search_value", {
                      search: filterKeys[0].type == "auto" ? `${t("name")}/${t("script_code")}` : t(""),
                    })!
                  }
                  value={filterKeys[0].value || ""}
                  onChange={(value) => {
                    if (value !== filterKeys[0].value) {
                      filterKeys[0].value = value;
                      if (!filterKeys[0].value) {
                        setFilterCache(null);
                        setFilterKeys([...filterKeys]);
                        return;
                      }
                      requestFilterResult({ value, type: filterKeys[0].type }).then((res) => {
                        if (filterKeys[0].value !== value) return;
                        setFilterCache(res as any);
                        setFilterKeys([...filterKeys]);
                      });
                    }
                  }}
                  onSearch={() => {
                    confirm!();
                  }}
                />
              </div>
            );
          },
          onFilter: (value: { type: SearchType; value: string }, row) => {
            if (!value || !value.value) {
              return true;
            }
            const result = filterCache.get(row.uuid);
            if (!result) return false;
            switch (value.type) {
              case "auto":
                return result.auto;
              case "script_code":
                return result.code;
              case "name":
                return result.name;
              default:
                return false;
            }
          },
          onFilterDropdownVisibleChange: (visible) => {
            if (visible) {
              setTimeout(() => inputRef.current!.focus(), 1);
            }
          },
          className: "max-w-[240px] min-w-[100px]",
          render: renderName,
        },
        {
          title: t("version"),
          dataIndex: "version",
          key: "version",
          width: 120,
          align: "center",
          render: renderVersion,
        },
        {
          key: "apply_to_run_status",
          title: t("apply_to_run_status"),
          width: t("script_list_apply_to_run_status_width"),
          className: "apply_to_run_status",
          render: renderApplyToRunStatus,
        },
        {
          title: t("source"),
          dataIndex: "origin",
          key: "origin",
          width: 100,
          render: renderSource,
        },
        {
          title: t("home"),
          dataIndex: "home",
          align: "center",
          key: "home",
          width: 100,
          render: renderHome,
        },
        {
          title: t("last_updated"),
          dataIndex: "updatetime",
          align: "center",
          key: "updatetime",
          width: t("script_list_last_updated_width"),
          sorter: (a, b) => a.updatetime - b.updatetime,
          render: renderUpdateTime,
        },
        {
          title: t("action"),
          dataIndex: "action",
          key: "action",
          width: 160,
          render: renderAction,
        },
      ] as ColumnProps[],
    [
      renderSort,
      renderEnableSwitch,
      renderName,
      renderVersion,
      renderApplyToRunStatus,
      renderSource,
      renderHome,
      renderUpdateTime,
      renderAction,
      t,
    ]
  );

  const [newColumns, setNewColumns] = useState<ColumnProps[]>([]);

  // 设置列和判断是否打开用户配置
  useEffect(() => {
    if (openUserConfig) {
      const dao = new ScriptDAO();
      dao.get(openUserConfig).then((script) => {
        if (script && script.config) {
          new ValueClient(message).getScriptValue(script).then((values) => {
            setUserConfig({
              script,
              userConfig: script.config!,
              values: values,
            });
          });
        }
      });
    }
    systemConfig.getScriptListColumnWidth().then((columnWidth) => {
      setSavedWidths({ ...columnWidth });
    });
  }, []);

  const [canShowList, setCanShowList] = useState(false);

  useEffect(() => {
    if (savedWidths === null) return;

    setNewColumns((nColumns) => {
      const widths = columns.map((item) => savedWidths[item.key!] ?? item.width);
      const c = nColumns.length === widths.length ? nColumns : columns;
      return c.map((item, i) => {
        const width = widths[i];
        return width === item.width
          ? item
          : {
              ...item,
              width,
            };
      });
    });
    setCanShowList(true);
  }, [savedWidths]);

  const dealColumns = useMemo(() => {
    if (!canShowList) {
      return [];
    } else {
      const filtered = newColumns.filter((item) => item.width !== -1);
      return filtered.length === 0 ? columns : filtered;
    }
  }, [newColumns, canShowList]);

  const components: ComponentsProps = useMemo(
    () => ({
      header: {
        operations: ({ selectionNode, expandNode }) => [
          {
            node: <th className="script-sort" />,
            width: 34,
          },
          {
            name: "expandNode",
            node: expandNode,
          },
          {
            name: "selectionNode",
            node: selectionNode,
          },
        ],
      },
      body: {
        operations: ({ selectionNode, expandNode }) => [
          {
            node: (
              <td>
                <div className="arco-table-cell">
                  <DragHandle />
                </div>
              </td>
            ),
            width: 34,
          },
          {
            name: "expandNode",
            node: expandNode,
          },
          {
            name: "selectionNode",
            node: selectionNode,
          },
        ],
        tbody: DraggableContainer,
        row: DraggableRow,
      },
    }),
    []
  );

  const setWidth = (selectColumn: number, width: any) => {
    setNewColumns((cols) =>
      cols.map((col, i) => (i === selectColumn && col.width !== width ? { ...col, width } : col))
    );
  };

  return (
    <Card
      id="script-list"
      className="script-list"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      <DraggableContext.Provider value={draggableContextValue}>
        <Space direction="vertical">
          {showAction && (
            <Card>
              <div
                className="flex flex-row justify-between items-center"
                style={{
                  padding: "8px 6px",
                }}
              >
                <Space direction="horizontal">
                  <Typography.Text>{t("batch_operations") + ":"}</Typography.Text>
                  <Select
                    style={{ minWidth: "100px" }}
                    triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
                    size="mini"
                    value={action}
                    onChange={(value) => {
                      setAction(value);
                    }}
                  >
                    <Select.Option key={"enable"} value="enable">
                      {t("enable")}
                    </Select.Option>
                    <Select.Option key={"disable"} value="disable">
                      {t("disable")}
                    </Select.Option>
                    <Select.Option key={"export"} value="export">
                      {t("export")}
                    </Select.Option>
                    <Select.Option key={"delete"} value="delete">
                      {t("delete")}
                    </Select.Option>
                    <Select.Option key={"pin_to_top"} value="pin_to_top">
                      {t("pin_to_top")}
                    </Select.Option>
                    <Select.Option key={"check_update"} value="check_update">
                      {t("check_update")}
                    </Select.Option>
                  </Select>
                  <Button
                    type="primary"
                    size="mini"
                    onClick={() => {
                      const enableAction = (enable: boolean) => {
                        const uuids = select.map((item) => item.uuid);
                        updateEntry(uuids, { enableLoading: true });
                        scriptClient.enables(uuids, enable);
                      };
                      switch (action) {
                        case "enable":
                          enableAction(true);
                          break;
                        case "disable":
                          enableAction(false);
                          break;
                        case "export": {
                          const sortedSelect = [...select].sort((a, b) => a.sort - b.sort);
                          const uuids = sortedSelect.map((item) => item.uuid);
                          Message.loading({
                            id: "export",
                            content: t("exporting"),
                          });
                          synchronizeClient.export(uuids).then(() => {
                            Message.success({
                              id: "export",
                              content: t("export_success"),
                              duration: 3000,
                            });
                          });
                          break;
                        }
                        case "delete":
                          if (confirm(t("list.confirm_delete"))) {
                            const uuids = select.map((item) => item.uuid);
                            scriptClient.deletes(uuids); // async
                          }
                          break;
                        case "pin_to_top": {
                          // 将选中的脚本置顶
                          const sortedSelect = [...select].sort((a, b) => a.sort - b.sort);
                          const uuids = sortedSelect.map((item) => item.uuid);
                          pinToTop(uuids).then(() => {
                            Message.success({
                              content: t("scripts_pinned_to_top"),
                              duration: 3000,
                            });
                          });
                          break;
                        }
                        // 批量检查更新
                        case "check_update":
                          if (confirm(t("list.confirm_update")!)) {
                            select.forEach((item, index, array) => {
                              if (!item.checkUpdateUrl) {
                                return;
                              }
                              Message.warning({
                                id: "checkupdateStart",
                                content: t("starting_updates"),
                              });
                              scriptClient
                                .requestCheckUpdate(item.uuid)
                                .then((res) => {
                                  if (res) {
                                    // 需要更新
                                    Message.warning({
                                      id: "checkupdate",
                                      content: `${i18nName(item)} ${t("new_version_available")}`,
                                    });
                                  }
                                  if (index === array.length - 1) {
                                    // 当前元素是最后一个
                                    Message.success({
                                      id: "checkupdateEnd",
                                      content: t("checked_for_all_selected"),
                                    });
                                  }
                                })
                                .catch((e) => {
                                  Message.error({
                                    id: "checkupdate",
                                    content: `${t("update_check_failed")}: ${e.message}`,
                                  });
                                });
                            });
                          }
                          break;
                        default:
                          Message.error(t("unknown_operation")!);
                          break;
                      }
                    }}
                  >
                    {t("confirm")}
                  </Button>
                  <Divider type="horizontal" />
                  <Typography.Text>{t("resize_column_width") + ":"}</Typography.Text>
                  <Select
                    style={{ minWidth: "80px" }}
                    triggerProps={{ autoAlignPopupWidth: false, autoAlignPopupMinWidth: true, position: "bl" }}
                    size="mini"
                    value={newColumns[selectColumn].title?.toString()}
                    onChange={(val) => {
                      const index = parseInt(val as string, 10);
                      setSelectColumn(index);
                    }}
                  >
                    {newColumns.map((column, index) => (
                      <Select.Option key={index} value={index}>
                        {column.title}
                      </Select.Option>
                    ))}
                  </Select>
                  <Dropdown
                    droplist={
                      <Menu>
                        <Menu.Item
                          key="auto"
                          onClick={() => {
                            setWidth(selectColumn, 0);
                          }}
                        >
                          {t("auto")}
                        </Menu.Item>
                        <Menu.Item
                          key="hide"
                          onClick={() => {
                            setWidth(selectColumn, -1);
                          }}
                        >
                          {t("hide")}
                        </Menu.Item>
                        <Menu.Item
                          key="custom"
                          onClick={() => {
                            const width =
                              (newColumns[selectColumn].width as number) > 0
                                ? newColumns[selectColumn].width
                                : columns[selectColumn].width;
                            setWidth(selectColumn, width);
                          }}
                        >
                          {t("custom")}
                        </Menu.Item>
                      </Menu>
                    }
                    position="bl"
                  >
                    <Input
                      type={
                        newColumns[selectColumn].width === 0 || newColumns[selectColumn].width === -1 ? "" : "number"
                      }
                      style={{ width: "80px" }}
                      size="mini"
                      value={
                        newColumns[selectColumn].width === 0
                          ? t("auto")
                          : newColumns[selectColumn].width === -1
                            ? t("hide")
                            : newColumns[selectColumn].width?.toString()
                      }
                      step={5}
                      onChange={(val) => {
                        const width = parseInt(val, 10);
                        setWidth(selectColumn, width);
                      }}
                    />
                  </Dropdown>
                  <Button
                    type="primary"
                    size="mini"
                    onClick={() => {
                      const newWidth: { [key: string]: number } = {};
                      for (const column of newColumns) {
                        newWidth[column.key! as string] = column.width as number;
                      }
                      systemConfig.setScriptListColumnWidth(newWidth);
                    }}
                  >
                    {t("save")}
                  </Button>
                  <Button
                    size="mini"
                    onClick={() => {
                      setNewColumns((cols) => {
                        return cols.map((col, index) => {
                          col.width = columns[index].width;
                          return col;
                        });
                      });
                    }}
                  >
                    {t("reset")}
                  </Button>
                </Space>
                <Button
                  type="primary"
                  size="mini"
                  onClick={() => {
                    setShowAction(false);
                  }}
                >
                  {t("close")}
                </Button>
              </div>
            </Card>
          )}
          {canShowList && (
            <Table
              key="script-list-table"
              className="arco-drag-table-container"
              components={components}
              rowKey="uuid"
              tableLayoutFixed
              columns={dealColumns}
              data={scriptList}
              pagination={false}
              style={
                {
                  // minWidth: "1200px",
                }
              }
              rowSelection={{
                type: "checkbox",
                onChange(_, selectedRows) {
                  setShowAction(true);
                  setSelect(selectedRows);
                },
              }}
            />
          )}
          {userConfig && (
            <UserConfigPanel script={userConfig.script} userConfig={userConfig.userConfig} values={userConfig.values} />
          )}
          <CloudScriptPlan
            script={cloudScript}
            onClose={() => {
              setCloudScript(undefined);
            }}
          />
        </Space>
      </DraggableContext.Provider>
    </Card>
  );
}

export default ScriptList;

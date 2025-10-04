import React, { useState, useRef, useEffect, useMemo } from "react";
import { Space } from "@arco-design/web-react";
import {
  IconPlayArrow,
  IconPause,
  IconStop,
  IconCode,
  IconDesktop,
  IconClockCircle,
  IconTags,
  IconLink,
  IconDown,
} from "@arco-design/web-react/icon";
import type { ScriptLoading } from "@App/pages/store/features/script";
import type { Script } from "@App/app/repo/scripts";
import {
  SCRIPT_RUN_STATUS_COMPLETE,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_NORMAL,
} from "@App/app/repo/scripts";
import { parseTags } from "@App/app/repo/metadata";
import { hashColor } from "../utils";
import { getCombinedMeta } from "@App/app/service/service_worker/utils";
import { useTranslation } from "react-i18next";

interface SidebarProps {
  /**
   * 侧边栏是否打开
   */
  open: boolean;
  scriptList: ScriptLoading[];
  onFilter: (data: ScriptLoading[]) => void;
}

interface FilterItem {
  key: string | number;
  label: string;
  icon: React.ReactNode;
  count: number;
  active?: boolean;
}

interface FilterGroupProps {
  title: string;
  items: FilterItem[];
  groupKey: string;
  collapsedGroups: Set<string>;
  selectedFilters: Record<string, string | number>;
  onFilterClick: (groupKey: string, itemKey: string | number) => void;
  onToggleCollapse: (groupKey: string) => void;
}

/**
 * 过滤器组件
 */
const FilterGroup = React.memo<FilterGroupProps>(
  ({ title, items, groupKey, collapsedGroups, selectedFilters, onFilterClick, onToggleCollapse }) => {
    const isCollapsed = collapsedGroups.has(groupKey);
    const selectedItem = selectedFilters[groupKey];
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number>(0);

    // 计算内容高度
    useEffect(() => {
      if (contentRef.current) {
        const height = contentRef.current.scrollHeight;
        if (height > 0) {
          setContentHeight(height);
        }
      }
    }, [items]);

    return (
      <div className="mb-4">
        <div
          className="flex items-center justify-between px-2 py-1 cursor-pointer rounded transition-all duration-200 hover:bg-fill-2"
          style={{ color: "var(--color-text-2)" }}
          onClick={() => onToggleCollapse(groupKey)}
        >
          <span className="text-sm font-medium select-none">{title}</span>
          <div
            className="transition-all duration-300 ease-out"
            style={{
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transformOrigin: "center",
            }}
          >
            <IconDown
              style={{
                fontSize: 12,
                transition: "color 0.2s ease",
              }}
            />
          </div>
        </div>
        <div
          className="overflow-hidden transition-all duration-300 ease-out"
          style={{
            height: isCollapsed ? 0 : contentHeight || "auto",
            marginTop: isCollapsed ? 0 : "8px",
            opacity: isCollapsed ? 0 : 1,
            transform: isCollapsed ? "translateY(-4px)" : "translateY(0)",
            transitionDelay: isCollapsed ? "0ms" : "50ms",
          }}
        >
          <div ref={contentRef} className="space-y-1">
            {items.map((item, index) => {
              const isSelected = selectedItem === item.key;
              return (
                <div
                  key={item.key}
                  className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-all ease-out ${
                    !isSelected ? "hover:bg-fill-2" : ""
                  }`}
                  style={{
                    backgroundColor: isSelected ? "var(--color-primary-light-1)" : "transparent",
                    color: isSelected ? "var(--color-primary-6)" : "var(--color-text-1)",
                    transitionDuration: "200ms",
                    transitionDelay: isCollapsed ? "0ms" : `${100 + index * 30}ms`,
                    transform: isCollapsed ? "translateX(-8px)" : "translateX(0)",
                    opacity: isCollapsed ? 0 : 1,
                  }}
                  onClick={() => onFilterClick(groupKey, item.key)}
                >
                  <Space size={8} style={{ flex: 1, minWidth: 0 }}>
                    {item.icon}
                    <span
                      className="text-sm"
                      style={{
                        display: "inline-block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "140px",
                      }}
                      title={item.label}
                    >
                      {item.label}
                    </span>
                  </Space>
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      backgroundColor: isSelected ? "var(--color-primary-light-2)" : "var(--color-fill-3)",
                      color: isSelected ? "var(--color-primary-6)" : "var(--color-text-3)",
                      fontWeight: isSelected ? "500" : "400",
                      minWidth: "24px",
                      textAlign: "center",
                    }}
                  >
                    {item.count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);

FilterGroup.displayName = "FilterGroup";

/**
 * 脚本列表侧边栏组件
 */
const ScriptListSidebar: React.FC<SidebarProps> = ({ open, scriptList, onFilter }) => {
  const { t } = useTranslation();
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string | number>>({
    status: "all",
    type: "all",
    tags: "all",
    source: "all",
  });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const handleFilterClick = (groupKey: string, itemKey: string | number) => {
    setSelectedFilters((prev) => ({
      ...prev,
      [groupKey]: itemKey,
    }));
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
      return next;
    });
  };

  // 计算数据量
  const { statusItems, typeItems, tagItems, sourceItems, tagMap, originMap } = useMemo(() => {
    // 状态过滤选项
    const statusItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconCode style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
      {
        key: SCRIPT_STATUS_ENABLE,
        label: t("enable"),
        icon: <IconPlayArrow style={{ fontSize: 14, color: "#52c41a" }} />,
        count: 0,
      },
      {
        key: SCRIPT_STATUS_DISABLE,
        label: t("disable"),
        icon: <IconPause style={{ fontSize: 14, color: "#ff4d4f" }} />,
        count: 0,
      },
      {
        key: SCRIPT_RUN_STATUS_RUNNING,
        label: t("running"),
        icon: <IconPlayArrow style={{ fontSize: 14, color: "#1890ff" }} />,
        count: 0,
      },
      {
        key: SCRIPT_RUN_STATUS_COMPLETE,
        label: t("script_list.sidebar.stopped"),
        icon: <IconStop style={{ fontSize: 14, color: "#8c8c8c" }} />,
        count: 0,
      },
    ];
    // 类型过滤选项
    const typeItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconCode style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
      {
        key: SCRIPT_TYPE_NORMAL,
        label: t("script_list.sidebar.normal_script"),
        icon: <IconCode style={{ fontSize: 14, color: "#1890ff" }} />,
        count: 0,
      },
      {
        key: SCRIPT_TYPE_BACKGROUND,
        label: t("background_script"),
        icon: <IconDesktop style={{ fontSize: 14, color: "#722ed1" }} />,
        count: 0,
      },
      {
        key: SCRIPT_TYPE_CRONTAB,
        label: t("scheduled_script"),
        icon: <IconClockCircle style={{ fontSize: 14, color: "#fa8c16" }} />,
        count: 0,
      },
    ];

    // 标签过滤选项
    const tagItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconTags style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
    ];

    // 安装来源过滤选项
    const sourceItems: FilterItem[] = [
      {
        key: "all",
        label: t("script_list.sidebar.all"),
        icon: <IconLink style={{ fontSize: 14 }} />,
        count: scriptList.length,
      },
    ];

    const tagMap = {} as Record<string, Set<string>>;
    const originMap = {} as Record<string, Set<string>>;

    for (const script of scriptList) {
      // 状态统计
      if (script.status === SCRIPT_STATUS_ENABLE) {
        statusItems[1].count++;
      } else {
        statusItems[2].count++;
      }
      if (script.type === SCRIPT_TYPE_NORMAL) {
        typeItems[1].count++;
      } else {
        if (script.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
          statusItems[3].count++;
        } else {
          statusItems[4].count++;
        }
        typeItems[2].count++;
        if (script.type === SCRIPT_TYPE_CRONTAB) {
          typeItems[3].count++;
        }
      }
      // 标签统计
      let metadata = script.metadata;
      if (script.selfMetadata) {
        metadata = getCombinedMeta(metadata, script.selfMetadata);
      }
      if (metadata.tag) {
        const tags = parseTags(metadata);
        for (const tag of tags) {
          const tagMapSet = tagMap[tag] || (tagMap[tag] = new Set());
          tagMapSet.add(script.uuid);
        }
      }
      // 来源统计
      if (script.originDomain) {
        const originMapSet = originMap[script.originDomain] || (originMap[script.originDomain] = new Set());
        originMapSet.add(script.uuid);
      }
    }
    tagItems.push(
      ...Object.keys(tagMap).map((tag) => {
        // 标签过滤选项
        const count = tagMap[tag]?.size || 0;
        return {
          key: tag,
          label: tag,
          icon: <div className={`w-3 h-3 arco-badge-color-${hashColor(tag)} rounded-full`} />,
          count,
        };
      })
    );
    sourceItems.push(
      ...Object.keys(originMap).map((source) => {
        const count = originMap[source]?.size || 0;
        return {
          key: source,
          label: source,
          icon: <div className={`w-3 h-3 arco-badge-color-${hashColor(source)} rounded-full`} />,
          count,
        };
      })
    );
    return { statusItems, typeItems, tagItems, sourceItems, tagMap, originMap };
  }, [scriptList, t]);

  useEffect(() => {
    // 过滤器方法变量
    const filterFuncs: Array<(script: Script) => boolean> = [];
    for (const [groupKey, itemKey] of Object.entries(selectedFilters)) {
      switch (groupKey) {
        case "status":
          switch (itemKey) {
            case "all":
              break;
            case SCRIPT_STATUS_ENABLE:
            case SCRIPT_STATUS_DISABLE:
              filterFuncs.push((script) => script.status === itemKey);
              break;
            case SCRIPT_RUN_STATUS_RUNNING:
            case SCRIPT_RUN_STATUS_COMPLETE:
              filterFuncs.push((script) => {
                if (script.type === SCRIPT_TYPE_NORMAL) {
                  return false;
                }
                return script.runStatus === itemKey;
              });
              break;
          }
          break;
        case "type":
          switch (itemKey) {
            case "all":
              break;
            case SCRIPT_TYPE_NORMAL:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_NORMAL);
              break;
            case SCRIPT_TYPE_BACKGROUND:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_BACKGROUND);
              break;
            case SCRIPT_TYPE_CRONTAB:
              filterFuncs.push((script) => script.type === SCRIPT_TYPE_CRONTAB);
              break;
          }
          break;
        case "tags":
          if (itemKey !== "all") {
            const scriptSet = tagMap[itemKey as string];
            if (scriptSet) {
              filterFuncs.push((script) => scriptSet.has(script.uuid));
            }
          }
          break;
        case "source":
          if (itemKey !== "all") {
            const scriptSet = originMap[itemKey as string];
            if (scriptSet) {
              filterFuncs.push((script) => scriptSet.has(script.uuid));
            }
          }
          break;
      }
    }
    onFilter(scriptList.filter((script) => filterFuncs.every((fn) => fn(script))));
  }, [onFilter, originMap, scriptList, selectedFilters, tagMap]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="w-64"
      style={{
        minWidth: "256px",
        padding: "16px",
        borderRight: "1px solid var(--color-neutral-3)",
        borderBottom: "1px solid var(--color-neutral-3)",
        backgroundColor: "var(--color-bg-2)",
      }}
    >
      <div className="space-y-4">
        <FilterGroup
          title={t("script_list.sidebar.status")}
          items={statusItems}
          groupKey="status"
          collapsedGroups={collapsedGroups}
          selectedFilters={selectedFilters}
          onFilterClick={handleFilterClick}
          onToggleCollapse={toggleGroupCollapse}
        />
        <FilterGroup
          title={t("type")}
          items={typeItems}
          groupKey="type"
          collapsedGroups={collapsedGroups}
          selectedFilters={selectedFilters}
          onFilterClick={handleFilterClick}
          onToggleCollapse={toggleGroupCollapse}
        />
        <FilterGroup
          title={t("tags")}
          items={tagItems}
          groupKey="tags"
          collapsedGroups={collapsedGroups}
          selectedFilters={selectedFilters}
          onFilterClick={handleFilterClick}
          onToggleCollapse={toggleGroupCollapse}
        />
        <FilterGroup
          title={t("install_source")}
          items={sourceItems}
          groupKey="source"
          collapsedGroups={collapsedGroups}
          selectedFilters={selectedFilters}
          onFilterClick={handleFilterClick}
          onToggleCollapse={toggleGroupCollapse}
        />
      </div>
    </div>
  );
};

export default ScriptListSidebar;

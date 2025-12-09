import React, { useState, useRef, useEffect } from "react";
import { Space } from "@arco-design/web-react";
import { IconDown } from "@arco-design/web-react/icon";
import { useTranslation } from "react-i18next";
import type { FilterItem } from "./hooks";

interface SidebarProps {
  /**
   * 侧边栏是否打开
   */
  open: boolean;
  filterItems: {
    statusItems: FilterItem[];
    typeItems: FilterItem[];
    tagItems: FilterItem[];
    sourceItems: FilterItem[];
  };
  selectedFilters: Record<string, string | number>;
  setSelectedFilters: React.Dispatch<React.SetStateAction<Record<string, string | number>>>;
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
      <div className="tw-mb-4">
        <div
          className="tw-flex tw-items-center tw-justify-between tw-px-2 tw-py-1 tw-cursor-pointer tw-rounded tw-transition-all tw-duration-200 hover:tw-bg-fill-2"
          style={{ color: "var(--color-text-2)" }}
          onClick={() => onToggleCollapse(groupKey)}
        >
          <span className="tw-text-sm tw-font-medium tw-select-none">{title}</span>
          <div
            className="tw-transition-all tw-duration-300 tw-ease-out"
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
          className="tw-overflow-hidden tw-transition-all tw-duration-300 tw-ease-out"
          style={{
            height: isCollapsed ? 0 : contentHeight || "auto",
            marginTop: isCollapsed ? 0 : "8px",
            opacity: isCollapsed ? 0 : 1,
            transform: isCollapsed ? "translateY(-4px)" : "translateY(0)",
            transitionDelay: isCollapsed ? "0ms" : "50ms",
          }}
        >
          <div ref={contentRef} className="tw-space-y-1">
            {items.map((item, index) => {
              const isSelected = selectedItem === item.key;
              return (
                <div
                  key={item.key}
                  className={`tw-flex tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-rounded tw-cursor-pointer tw-transition-all tw-ease-out ${!isSelected ? "hover:tw-bg-fill-2" : ""}`}
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
                      className="tw-text-sm"
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
                    className="tw-text-xs tw-px-2 tw-py-1 tw-rounded"
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
const ScriptListSidebar: React.FC<SidebarProps> = React.memo(
  ({ open, filterItems, selectedFilters, setSelectedFilters }) => {
    const { t } = useTranslation();
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const { statusItems, typeItems, tagItems, sourceItems } = filterItems;

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

    if (!open) {
      return null;
    }

    return (
      <div
        className="tw-w-64"
        style={{
          minWidth: "256px",
          padding: "16px",
          borderRight: "1px solid var(--color-neutral-3)",
          borderBottom: "1px solid var(--color-neutral-3)",
          backgroundColor: "var(--color-bg-2)",
        }}
      >
        <div className="tw-space-y-4">
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
  }
);

ScriptListSidebar.displayName = "ScriptListSidebar";

export default ScriptListSidebar;

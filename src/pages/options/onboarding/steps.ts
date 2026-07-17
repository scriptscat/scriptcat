import type { TourStep } from "./types";

export const DESKTOP_STEPS: TourStep[] = [
  {
    id: "installed",
    target: "nav-scripts",
    route: "/",
    titleKey: "guide:installed_scripts_title",
    contentKey: "guide:installed_scripts",
    placement: "right",
  },
  {
    id: "market",
    target: "install-entry",
    route: "/",
    titleKey: "guide:script_list_title",
    contentKey: "guide:script_list_content",
    placement: "bottom",
  },
  {
    id: "enable",
    target: "col-enable",
    route: "/",
    titleKey: "guide:script_list_enable_title",
    contentKey: "guide:script_list_enable_content",
    placement: "bottom",
  },
  {
    id: "action",
    target: "col-action",
    route: "/",
    titleKey: "guide:script_list_action_title",
    contentKey: "guide:script_list_action_content",
    placement: "left",
  },
  {
    id: "backup",
    target: "tools-backup",
    route: "/tools",
    titleKey: "guide:tools_backup_title",
    contentKey: "guide:tools_backup_content",
    placement: "bottom",
  },
  {
    id: "sync",
    target: "setting-sync",
    route: "/settings",
    titleKey: "guide:setting_sync_title",
    contentKey: "guide:setting_sync_content",
    placement: "bottom",
  },
];

export const MOBILE_STEPS: TourStep[] = [
  {
    id: "installed",
    target: "m-card-list",
    titleKey: "guide:installed_scripts_title",
    contentKey: "guide:installed_scripts",
    placement: "bottom",
  },
  {
    id: "market",
    target: "m-install",
    titleKey: "guide:script_list_title",
    contentKey: "guide:script_list_content",
    placement: "bottom",
  },
  {
    id: "subscribe",
    target: "tab-subscribe",
    titleKey: "guide:subscribe_title",
    contentKey: "guide:subscribe_content",
    placement: "top",
  },
];

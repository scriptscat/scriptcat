import type { TFunction } from "i18next";
import type { ScriptLoading } from "@App/pages/store/features/script";
import {
  SCRIPT_TYPE_NORMAL,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_RUN_STATUS_COMPLETE,
} from "@App/app/repo/scripts";

// 固定时间戳（脚本环境禁用 Date.now()，演示数据也无需真实时间）
const TS = 1_700_000_000_000;

/** 仅在巡览期间用于演示的示例脚本（纯展示，不落库、不可交互）。 */
export function getDemoScripts(t: TFunction): ScriptLoading[] {
  return [
    {
      uuid: "demo-normal",
      name: t("guide:demo_normal_name"),
      namespace: "https://scriptcat.org/",
      type: SCRIPT_TYPE_NORMAL,
      status: SCRIPT_STATUS_ENABLE,
      sort: 0,
      runStatus: SCRIPT_RUN_STATUS_COMPLETE,
      createtime: TS,
      updatetime: TS,
      checktime: TS,
      metadata: {
        name: [t("guide:demo_normal_name")],
        version: ["1.0.0"],
        match: ["https://example.com/*"],
        description: [t("guide:demo_normal_desc")],
      },
    },
    {
      uuid: "demo-background",
      name: t("guide:demo_background_name"),
      namespace: "https://scriptcat.org/",
      type: SCRIPT_TYPE_BACKGROUND,
      status: SCRIPT_STATUS_ENABLE,
      sort: 1,
      runStatus: SCRIPT_RUN_STATUS_COMPLETE,
      createtime: TS,
      updatetime: TS,
      checktime: TS,
      metadata: {
        name: [t("guide:demo_background_name")],
        version: ["1.0.0"],
        background: [""],
        description: [t("guide:demo_background_desc")],
      },
    },
  ];
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Announcements, UniqueIdentifier } from "@dnd-kit/core";
import type { NetworkRule } from "@App/app/repo/network_rule";

type DragAccessibility = {
  container: HTMLElement;
  announcements: Announcements;
  screenReaderInstructions: { draggable: string };
};

/**
 * dnd-kit 的内置播报是英文且只念规则 ID，读屏用户听不出拿起的是哪条规则、落到第几位。
 * 位次取自完整列表（与「顺序」列一致），不是当前页内的序号。
 */
export function useDragAccessibility(
  rules: NetworkRule[],
  positionOf: (rule: NetworkRule) => number,
  total: number
): DragAccessibility {
  const { t } = useTranslation();
  return useMemo(() => {
    const describe = (id: UniqueIdentifier | undefined) => {
      const rule = rules.find((item) => item.id === id);
      return rule && { name: rule.name, position: positionOf(rule) };
    };
    return {
      container: document.body,
      screenReaderInstructions: { draggable: t("tools:network_rules_drag_instructions") },
      announcements: {
        onDragStart: ({ active }) => {
          const dragged = describe(active.id);
          return dragged && t("tools:network_rules_drag_picked_up", { ...dragged, total });
        },
        onDragOver: ({ active, over }) => {
          const dragged = describe(active.id);
          const target = describe(over?.id);
          return (
            dragged &&
            target &&
            t("tools:network_rules_drag_moved_over", { name: dragged.name, position: target.position })
          );
        },
        onDragEnd: ({ active, over }) => {
          const dragged = describe(active.id);
          if (!dragged) return undefined;
          const target = describe(over?.id);
          return target
            ? t("tools:network_rules_drag_dropped", { name: dragged.name, position: target.position })
            : t("tools:network_rules_drag_cancelled", dragged);
        },
        onDragCancel: ({ active }) => {
          const dragged = describe(active.id);
          return dragged && t("tools:network_rules_drag_cancelled", dragged);
        },
      },
    };
  }, [t, rules, positionOf, total]);
}

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import type { DragEndEvent } from "@dnd-kit/core";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { NetworkRule } from "@App/app/repo/network_rule";
import { Switch } from "@App/pages/components/ui/switch";
import { cn } from "@App/pkg/utils/cn";
import { useDragAccessibility } from "./dragAccessibility";
import { ActionBadge, RuleName, RuleRowMenu, ScopeChips, type RuleRowActions } from "./RuleParts";

// 长按手柄进入拖拽；delay 之内的移动仍按滚动处理。
const LONG_PRESS = { delay: 300, tolerance: 8 };

export type RuleCardsProps = RuleRowActions & {
  rules: NetworkRule[];
  positionOf: (rule: NetworkRule) => number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
  onDragEnd: (activeId: string, overId: string) => void;
};

export default function RuleCards({
  rules,
  positionOf,
  total,
  dragDisabled,
  busy,
  onToggleEnabled,
  onDragEnd,
  ...moveHandlers
}: RuleCardsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: LONG_PRESS }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = useMemo(() => rules.map((rule) => rule.id), [rules]);
  const a11y = useDragAccessibility(rules, positionOf, total);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onDragEnd(`${active.id}`, `${over.id}`);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={handleDragEnd}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      accessibility={a11y}
    >
      <div className="flex flex-col gap-2">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {rules.map((rule) => (
            <SortableRuleCard
              key={rule.id}
              rule={rule}
              position={positionOf(rule)}
              total={total}
              dragDisabled={dragDisabled}
              busy={busy}
              onToggleEnabled={onToggleEnabled}
              {...moveHandlers}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}

function SortableRuleCard({
  rule,
  position,
  total,
  dragDisabled,
  busy,
  onToggleEnabled,
  ...moveHandlers
}: RuleRowActions & {
  rule: NetworkRule;
  position: number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: rule.id,
    disabled: dragDisabled,
  });

  return (
    <div
      ref={setNodeRef}
      data-testid="network-rule-row"
      style={{ transform: CSS.Transform.toString(transform) ?? undefined, transition }}
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-3",
        isDragging && "relative z-10 opacity-50",
        !rule.enabled && "opacity-60"
      )}
    >
      {/* touch-none 而不是 touch-manipulation：后者仍允许浏览器在拖拽途中把手势收回去做滚动。 */}
      <button
        type="button"
        ref={setActivatorNodeRef}
        disabled={dragDisabled}
        aria-label={t("tools:network_rules_drag_handle", { name: rule.name })}
        className="flex cursor-grab touch-none items-center py-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <Switch
            checked={rule.enabled}
            disabled={busy}
            aria-label={t("tools:network_rules_enable_rule", { name: rule.name })}
            onCheckedChange={(checked) => onToggleEnabled(rule, checked)}
          />
          <div className="min-w-0 flex-1">
            <RuleName rule={rule} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{position}</span>
          <RuleRowMenu rule={rule} position={position} total={total} disabled={busy} {...moveHandlers} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-12">
          <ActionBadge rule={rule} />
          <ScopeChips rule={rule} />
        </div>
      </div>
    </div>
  );
}

import { memo, useCallback, useMemo } from "react";
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
import {
  ActionBadge,
  RuleName,
  RuleRowMenu,
  ScopeChips,
  useRuleRowLabels,
  type RuleRowActions,
  type RuleRowLabels,
} from "./RuleParts";

// 长按手柄进入拖拽；delay 之内的移动仍按滚动处理。
const LONG_PRESS = { delay: 300, tolerance: 8 };
const POINTER_SENSOR_OPTIONS = { activationConstraint: LONG_PRESS };
const KEYBOARD_SENSOR_OPTIONS = { coordinateGetter: sortableKeyboardCoordinates };
const DRAG_MODIFIERS = [restrictToVerticalAxis];

export type RuleCardsProps = RuleRowActions & {
  rules: NetworkRule[];
  positionOf: (rule: NetworkRule) => number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
  onDragEnd: (activeId: string, overId: string) => void;
};

const RuleCards = memo(function RuleCards({
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
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor, KEYBOARD_SENSOR_OPTIONS)
  );
  // dnd-kit 会把 items 引用传给每一行；规则对象刷新但顺序不变时保留这份引用。
  const idsKey = useMemo(() => JSON.stringify(rules.map((rule) => rule.id)), [rules]);
  const ids = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const labels = useRuleRowLabels();
  const a11y = useDragAccessibility(rules, positionOf, total);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (over && active.id !== over.id) onDragEnd(`${active.id}`, `${over.id}`);
    },
    [onDragEnd]
  );

  return (
    <div className="flex flex-col gap-2">
      {dragDisabled ? (
        rules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            position={positionOf(rule)}
            total={total}
            dragDisabled
            busy={busy}
            labels={labels}
            onToggleEnabled={onToggleEnabled}
            {...moveHandlers}
          />
        ))
      ) : (
        <DndContext
          sensors={sensors}
          onDragEnd={handleDragEnd}
          collisionDetection={closestCenter}
          modifiers={DRAG_MODIFIERS}
          accessibility={a11y}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {rules.map((rule) => (
              <SortableRuleCard
                key={rule.id}
                rule={rule}
                position={positionOf(rule)}
                total={total}
                dragDisabled={false}
                busy={busy}
                labels={labels}
                onToggleEnabled={onToggleEnabled}
                {...moveHandlers}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
});

type RuleCardProps = RuleRowActions & {
  rule: NetworkRule;
  position: number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  labels: RuleRowLabels;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
};

/** 与 RuleTable 的行同理：只有拖拽接线留在外层，花钱的部分放进 memo 边界内。 */
const SortableRuleCard = memo(function SortableRuleCard({ rule, dragDisabled, labels, ...bodyProps }: RuleCardProps) {
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: rule.id,
    disabled: dragDisabled,
  });

  return (
    <RuleCard
      rule={rule}
      dragDisabled={dragDisabled}
      labels={labels}
      drag={{ setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging }}
      {...bodyProps}
    />
  );
});

type RuleCardDragProps = Pick<
  ReturnType<typeof useSortable>,
  "setNodeRef" | "setActivatorNodeRef" | "listeners" | "attributes" | "transform" | "transition" | "isDragging"
>;

const RuleCard = memo(function RuleCard({
  rule,
  dragDisabled,
  labels,
  drag,
  ...bodyProps
}: RuleCardProps & { drag?: RuleCardDragProps }) {
  return (
    <div
      ref={drag?.setNodeRef}
      data-testid="network-rule-row"
      style={
        drag
          ? { transform: CSS.Transform.toString(drag.transform) ?? undefined, transition: drag.transition }
          : undefined
      }
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border p-3",
        drag?.isDragging && "relative z-10 opacity-50",
        !rule.enabled && "opacity-60"
      )}
    >
      {/* touch-none 而不是 touch-manipulation：后者仍允许浏览器在拖拽途中把手势收回去做滚动。 */}
      <button
        type="button"
        ref={drag?.setActivatorNodeRef}
        disabled={dragDisabled}
        aria-label={labels.dragHandle(rule.name)}
        className="flex cursor-grab touch-none items-center py-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        {...drag?.attributes}
        {...drag?.listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <RuleCardBody rule={rule} labels={labels} {...bodyProps} />
    </div>
  );
});

const RuleCardBody = memo(function RuleCardBody({
  rule,
  position,
  total,
  busy,
  labels,
  onToggleEnabled,
  ...moveHandlers
}: Omit<RuleCardProps, "dragDisabled">) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-3">
        <Switch
          checked={rule.enabled}
          disabled={busy}
          aria-label={labels.enableRule(rule.name)}
          onCheckedChange={(checked) => onToggleEnabled(rule, checked)}
        />
        <div className="min-w-0 flex-1">
          <RuleName rule={rule} labels={labels} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{position}</span>
        <RuleRowMenu rule={rule} position={position} total={total} disabled={busy} labels={labels} {...moveHandlers} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        <ActionBadge action={rule.action.type} label={labels.actions[rule.action.type]} />
        <ScopeChips rule={rule} allSitesLabel={labels.allWebsites} />
      </div>
    </div>
  );
});

export default RuleCards;

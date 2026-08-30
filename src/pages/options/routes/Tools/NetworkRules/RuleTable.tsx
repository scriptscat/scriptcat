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
import { Checkbox } from "@App/pages/components/ui/checkbox";
import { Switch } from "@App/pages/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@App/pages/components/ui/table";
import { cn } from "@App/pkg/utils/cn";
import { ActionBadge, RuleName, RuleRowMenu, ScopeChips, type RuleMoveHandlers } from "./RuleParts";

// 列宽 = 设计稿的内容宽 + 12px 列间距（单元格左右各 6px 内边距）。
const COL = {
  grip: "w-8",
  select: "w-7",
  enable: "w-14",
  action: "w-[122px]",
  scope: "w-[272px]",
  order: "w-[68px]",
  menu: "w-11",
};

export type RuleTableProps = RuleMoveHandlers & {
  rules: NetworkRule[];
  positionOf: (rule: NetworkRule) => number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectPage: (checked: boolean) => void;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
  onDragEnd: (activeId: string, overId: string) => void;
};

export default function RuleTable({
  rules,
  positionOf,
  total,
  dragDisabled,
  busy,
  selected,
  onSelect,
  onSelectPage,
  onToggleEnabled,
  onDragEnd,
  ...moveHandlers
}: RuleTableProps) {
  const { t } = useTranslation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = useMemo(() => rules.map((rule) => rule.id), [rules]);
  const a11y = useMemo(() => ({ container: document.body }), []);
  const allSelected = rules.length > 0 && rules.every((rule) => selected.has(rule.id));
  const someSelected = rules.some((rule) => selected.has(rule.id));

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
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className={COL.grip} />
            <TableHead className={COL.select}>
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                aria-label={t("tools:network_rules_select_all")}
                onCheckedChange={(checked) => onSelectPage(checked === true)}
              />
            </TableHead>
            <TableHead className={COL.enable} />
            <TableHead>{t("tools:network_rules_column_name")}</TableHead>
            <TableHead className={COL.action}>{t("tools:network_rules_column_action")}</TableHead>
            <TableHead className={COL.scope}>{t("tools:network_rules_column_scope")}</TableHead>
            <TableHead className={COL.order}>{t("tools:network_rules_column_order")}</TableHead>
            <TableHead className={COL.menu} />
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {rules.map((rule) => (
              <SortableRuleRow
                key={rule.id}
                rule={rule}
                position={positionOf(rule)}
                total={total}
                dragDisabled={dragDisabled}
                busy={busy}
                selected={selected.has(rule.id)}
                onSelect={onSelect}
                onToggleEnabled={onToggleEnabled}
                {...moveHandlers}
              />
            ))}
          </SortableContext>
        </TableBody>
      </Table>
    </DndContext>
  );
}

function SortableRuleRow({
  rule,
  position,
  total,
  dragDisabled,
  busy,
  selected,
  onSelect,
  onToggleEnabled,
  ...moveHandlers
}: RuleMoveHandlers & {
  rule: NetworkRule;
  position: number;
  total: number;
  dragDisabled: boolean;
  busy: boolean;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onToggleEnabled: (rule: NetworkRule, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({
    id: rule.id,
    disabled: dragDisabled,
  });

  return (
    <TableRow
      ref={setNodeRef}
      data-testid="network-rule-row"
      data-state={selected ? "selected" : undefined}
      style={{ transform: CSS.Transform.toString(transform) ?? undefined, transition }}
      className={cn(isDragging && "relative z-10 opacity-50", !rule.enabled && "opacity-60")}
      {...attributes}
    >
      <TableCell className={COL.grip}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          disabled={dragDisabled}
          aria-label={t("tools:network_rules_drag_handle", { name: rule.name })}
          className="flex cursor-grab items-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      <TableCell className={COL.select}>
        <Checkbox
          checked={selected}
          aria-label={t("tools:network_rules_select_rule", { name: rule.name })}
          onCheckedChange={(checked) => onSelect(rule.id, checked === true)}
        />
      </TableCell>
      <TableCell className={COL.enable}>
        <Switch
          checked={rule.enabled}
          disabled={busy}
          aria-label={t("tools:network_rules_enable_rule", { name: rule.name })}
          onCheckedChange={(checked) => onToggleEnabled(rule, checked)}
        />
      </TableCell>
      <TableCell>
        <RuleName rule={rule} />
      </TableCell>
      <TableCell className={COL.action}>
        <ActionBadge rule={rule} />
      </TableCell>
      <TableCell className={COL.scope}>
        <ScopeChips rule={rule} />
      </TableCell>
      <TableCell className={cn(COL.order, "text-xs tabular-nums text-muted-foreground")}>{position}</TableCell>
      <TableCell className={COL.menu}>
        <RuleRowMenu rule={rule} position={position} total={total} disabled={busy} {...moveHandlers} />
      </TableCell>
    </TableRow>
  );
}

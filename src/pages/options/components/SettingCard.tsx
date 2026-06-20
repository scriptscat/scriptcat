import React from "react";
import { Surface } from "@App/pages/components/ui/surface";

export function SettingCard({
  id,
  title,
  titleAction,
  description,
  register,
  children,
}: {
  id: string;
  title: string;
  titleAction?: React.ReactNode;
  description?: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section ref={register(id)} data-spy-id={id} className="scroll-mt-6">
      <Surface padding="none">
        <div className="flex flex-col gap-0.5 px-5 pt-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
            {titleAction}
          </div>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-col gap-3.5 px-5 pt-3.5 pb-[18px]">{children}</div>
      </Surface>
    </section>
  );
}

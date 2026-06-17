import React from "react";

export function SettingCard({
  id,
  title,
  description,
  register,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  register: (id: string) => (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section ref={register(id)} data-spy-id={id} className="scroll-mt-6 rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-0.5 px-5 pt-4">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col gap-3.5 px-5 pt-3.5 pb-[18px]">{children}</div>
    </section>
  );
}

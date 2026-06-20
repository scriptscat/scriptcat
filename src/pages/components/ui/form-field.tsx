import * as React from "react";
import { cn } from "@App/pkg/utils/cn";
import { Label } from "./label";

type FormFieldProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode;
  htmlFor?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
};

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden="true">
      {"*"}
    </span>
  );
}

function FormField({ label, htmlFor, description, error, required, children, className, ...props }: FormFieldProps) {
  return (
    <div
      data-slot="form-field"
      data-invalid={error ? "" : undefined}
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    >
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required && <RequiredMark />}
      </Label>
      {children}
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

type SwitchFieldProps = React.HTMLAttributes<HTMLDivElement> & {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
};

function SwitchField({ label, description, children, className, ...props }: SwitchFieldProps) {
  return (
    <div data-slot="switch-field" className={cn("flex items-center justify-between gap-3", className)} {...props}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && <span className="text-xs text-muted-foreground">{description}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export { FormField, SwitchField };
export type { FormFieldProps, SwitchFieldProps };

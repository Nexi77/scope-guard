import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldControlProps {
  id: string;
  required?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
  "aria-invalid": boolean | undefined;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (controlProps: FieldControlProps) => ReactNode;
}

function Field({ id, label, hint, error, required = false, className, children }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="field" className={cn("space-y-1", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only"> required</span>
          </>
        ) : null}
      </Label>
      {children({
        id,
        ...(required ? { required: true, "aria-required": true } : {}),
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-destructive flex items-center gap-1 text-xs" role="alert">
          <CircleAlert className="size-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <div id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export { Field, type FieldControlProps, type FieldProps };

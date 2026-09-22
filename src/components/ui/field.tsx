import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid": boolean | undefined;
}

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (controlProps: FieldControlProps) => ReactNode;
}

function Field({ id, label, hint, error, className, children }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="field" className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
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

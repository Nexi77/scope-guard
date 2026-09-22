import type { ReactNode } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(controlProps) => (
        <div className="relative">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2">
            {icon}
          </span>
          <Input
            {...controlProps}
            name={name ?? id}
            type={type}
            value={value}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            placeholder={placeholder}
            className="h-11 rounded-lg pl-10"
          />
          {endContent}
        </div>
      )}
    </Field>
  );
}

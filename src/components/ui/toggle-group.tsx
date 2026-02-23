import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ToggleGroupProps {
  type: "single" | "multiple";
  value?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  children: React.ReactNode;
  className?: string;
}

const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ type, value, onValueChange, children, className }, ref) => {
    const handleToggle = (itemValue: string) => {
      if (type === "single") {
        onValueChange?.(itemValue === value ? "" : itemValue);
      } else {
        const currentValues = Array.isArray(value) ? value : [];
        const newValues = currentValues.includes(itemValue)
          ? currentValues.filter((v) => v !== itemValue)
          : [...currentValues, itemValue];
        onValueChange?.(newValues);
      }
    };

    return (
      <div ref={ref} className={cn("flex items-center gap-1", className)}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, {
              ...child.props,
              onValueChange: handleToggle,
              isActive:
                type === "single"
                  ? child.props.value === value
                  : Array.isArray(value) && value.includes(child.props.value),
            } as any);
          }
          return child;
        })}
      </div>
    );
  }
);
ToggleGroup.displayName = "ToggleGroup";

interface ToggleGroupItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
  isActive?: boolean;
}

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  ToggleGroupItemProps
>(({ value, children, className, onValueChange, isActive }, ref) => {
  return (
    <Button
      ref={ref}
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={() => onValueChange?.(value)}
      className={cn(className)}
      type="button"
    >
      {children}
    </Button>
  );
});
ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };

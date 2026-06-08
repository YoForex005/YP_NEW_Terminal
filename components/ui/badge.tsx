import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/15 text-primary",
        outline: "border-border bg-transparent text-foreground",
        secondary: "border-border bg-muted text-muted-foreground",
        success: "border-primary/20 bg-primary/10 text-primary dark:text-primary dark:border-primary/30",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:border-amber-500/30",
        danger: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 dark:border-rose-500/30",
        destructive: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 dark:border-rose-500/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

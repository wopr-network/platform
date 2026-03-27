import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const bannerVariants = cva("w-full px-4 py-3 text-sm font-mono border-b flex items-center gap-3", {
  variants: {
    variant: {
      default: "bg-primary/10 text-primary border-primary/20",
      terminal: "bg-terminal/5 text-terminal border-terminal/20",
      destructive: "bg-destructive/10 text-destructive border-destructive/20",
      warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      info: "border-blue-500/25 bg-blue-500/10 text-blue-400 [&>svg]:text-blue-400",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function Banner({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bannerVariants>) {
  return (
    <div
      data-slot="banner"
      data-variant={variant}
      className={cn(bannerVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Banner, bannerVariants };

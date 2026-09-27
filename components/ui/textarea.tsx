import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      // The v4 `field-sizing-content` utility is deliberately not ported as
      // an arbitrary field-sizing property: it overrides the `rows` many call sites set.
      className={cn(
        "flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring ap-focus-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-[invalid=true]:border-destructive/50 dark:aria-[invalid=true]:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

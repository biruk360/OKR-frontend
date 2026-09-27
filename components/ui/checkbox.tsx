"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Tailwind v3: Radix sets data-state="checked" (no bare data-checked
        // variant), aria-invalid needs the arbitrary form, and ring-3 is
        // ring-[3px]. tailwind.config.js has no primary DEFAULT/foreground
        // colour, so the themed --primary channels are referenced directly.
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-[:disabled]/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring ap-focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-destructive/20 aria-[invalid=true]:aria-checked:border-[hsl(var(--primary))] dark:bg-input/30 dark:aria-[invalid=true]:border-destructive/50 dark:aria-[invalid=true]:ring-destructive/40 data-[state=checked]:border-[hsl(var(--primary))] data-[state=checked]:bg-[hsl(var(--primary))] data-[state=checked]:text-[hsl(var(--primary-foreground))] dark:data-[state=checked]:bg-[hsl(var(--primary))]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

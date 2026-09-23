import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium tracking-[-0.01em] ring-offset-background transition-[background-color,color,opacity,transform,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 md:text-sm [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Filled accent — the one primary action on a screen */
        default: "bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90",
        /** Accent-tinted fill — secondary actions (iOS "tinted" button) */
        tinted: "bg-primary/10 text-primary hover:bg-primary/15 dark:bg-primary/20 dark:hover:bg-primary/25",
        destructive:
          "bg-destructive font-semibold text-destructive-foreground hover:bg-destructive/90",
        /** Red-tinted fill for destructive secondary actions */
        "destructive-tinted": "bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/20",
        outline:
          "border border-border bg-card text-foreground shadow-sm hover:bg-accent",
        /** Gray fill (iOS "gray" button) */
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-accent",
        /** Text-only accent button (iOS "plain" button / nav bar button) */
        plain: "text-primary hover:opacity-70 active:opacity-50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 md:h-9 md:px-4",
        sm: "h-9 px-3.5 text-sm md:h-8 md:px-3 md:text-[13px]",
        lg: "h-12 px-6 text-[17px] md:h-11 md:text-[15px]",
        icon: "h-11 w-11 md:h-9 md:w-9",
        "icon-sm": "h-9 w-9 md:h-8 md:w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

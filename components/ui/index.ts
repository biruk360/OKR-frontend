// Domain-specific components (preserved API, shadcn internals)
export { Modal } from './Modal'
export type { ModalProps, ModalSize } from './Modal'

export { ConfirmDialog } from './ConfirmDialog'
export type { ConfirmDialogProps, ConfirmVariant } from './ConfirmDialog'

export { default as SideDrawer } from './SideDrawer'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { StatCard } from './StatCard'
export type { StatCardProps, StatCardTone } from './StatCard'

export { StatGrid } from './StatGrid'
export type { StatGridProps } from './StatGrid'

export { PageHeader } from './PageHeader'
export type { PageHeaderProps } from './PageHeader'

export { ActionsMenu } from './ActionsMenu'
export type { ActionsMenuProps, ActionsMenuItem } from './ActionsMenu'

export { Eyebrow } from './Eyebrow'
export type { EyebrowProps, EyebrowSize, EyebrowAlign } from './Eyebrow'

export { SectionHeading } from './SectionHeading'
export type { SectionHeadingProps } from './SectionHeading'

export { FilterSelect } from './FilterSelect'
export type { FilterSelectProps, FilterSelectOption } from './FilterSelect'

export { EntityPicker } from './EntityPicker'
export type { EntityPickerProps, EntityPickerValue, EntityKind } from './EntityPicker'

// Promoted out of ./dashboard — this is also the app's count chip. Do not add a
// CountChip; see docs/design_refresh_IMPLEMENTATION_STRATEGY.md §4.
export { MiniBadge } from './dashboard/MiniBadge'
export type { MiniBadgeTone } from './dashboard/MiniBadge'

// shadcn/ui primitives
export { Button, buttonVariants } from './button'
export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent } from './card'
export { Badge, badgeVariants } from './badge'
export { Separator } from './separator'
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from './dialog'
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu'
export { Popover, PopoverTrigger, PopoverAnchor, PopoverClose, PopoverContent } from './popover'
export type { PopoverContentProps, PopoverVariant, PopoverShadow } from './popover'
export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from './select'
export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from './sheet'
export { Input } from './input'
export { Label } from './label'
export { Textarea } from './textarea'
export { Checkbox } from './checkbox'
export { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
export { ScrollArea, ScrollBar } from './scroll-area'
export type { ScrollAreaOrientation } from './scroll-area'
export { Alert, AlertTitle, AlertDescription } from './alert'
export { Progress } from './progress'
export type { ProgressProps } from './progress'

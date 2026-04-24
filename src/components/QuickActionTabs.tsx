import { LucideIcon } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface QuickActionTabItem {
  value: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

interface QuickActionTabsProps {
  items: QuickActionTabItem[];
  className?: string;
}

/**
 * Renders tab triggers as a uniform grid of icon+label cards.
 * Cards have a fixed height, icon and label sit side-by-side, and long
 * labels are truncated (full text shown via tooltip) so the layout stays
 * tidy regardless of the number of tabs.
 */
export function QuickActionTabs({ items, className }: QuickActionTabsProps) {
  return (
    <TabsList
      className={cn(
        "grid h-auto w-full bg-transparent p-0 gap-2",
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7",
        className
      )}
    >
      {items.map(({ value, label, icon: Icon, count }) => (
        <Tooltip key={value} delayDuration={300}>
          <TooltipTrigger asChild>
            <TabsTrigger
              value={value}
              className={cn(
                "flex flex-row items-center justify-start gap-2 h-10 w-full px-3 py-0 min-w-0 overflow-hidden",
                "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
                "transition-all hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
                "data-[state=active]:border-primary data-[state=active]:bg-primary/10",
                "data-[state=active]:text-primary data-[state=active]:shadow-md"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium leading-tight truncate min-w-0 flex-1 text-left">
                {label}
              </span>
              {typeof count === "number" && (
                <span className="text-[10px] font-medium text-muted-foreground shrink-0 tabular-nums">
                  {count}
                </span>
              )}
            </TabsTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {label}
            {typeof count === "number" && ` (${count})`}
          </TooltipContent>
        </Tooltip>
      ))}
    </TabsList>
  );
}


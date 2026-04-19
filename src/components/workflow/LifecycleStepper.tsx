import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  key: string;
  label: string;
  status: "complete" | "current" | "pending";
}

interface Props {
  steps: Step[];
  className?: string;
}

export function LifecycleStepper({ steps, className }: Props) {
  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
              step.status === "complete" && "bg-success/15 text-success border-success/30",
              step.status === "current" && "bg-primary/15 text-primary border-primary/30",
              step.status === "pending" && "bg-muted text-muted-foreground border-border",
            )}
          >
            {step.status === "complete" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

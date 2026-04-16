import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layers, FolderKanban, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const healthColor: Record<string, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

const statusToHealth = (status: string): string => {
  if (["active", "in_progress", "live"].includes(status)) return "green";
  if (["on_hold", "at_risk", "concept", "planning"].includes(status)) return "amber";
  if (["cancelled", "closed", "failed"].includes(status)) return "red";
  return "amber";
};

interface EntityGroup {
  label: string;
  icon: React.ReactNode;
  items: { name: string; health: string }[];
}

export function StatusIndicators() {
  const { data, isLoading } = useQuery({
    queryKey: ["status-indicators"],
    queryFn: async () => {
      const [progs, projs, prods] = await Promise.all([
        supabase.from("programmes").select("id, name, status"),
        supabase.from("projects").select("id, name, health"),
        supabase.from("products").select("id, name, status"),
      ]);
      return {
        programmes: (progs.data || []).map((p) => ({ name: p.name, health: statusToHealth(p.status) })),
        projects: (projs.data || []).map((p) => ({ name: p.name, health: p.health || "amber" })),
        products: (prods.data || []).map((p) => ({ name: p.name, health: statusToHealth(p.status) })),
      };
    },
  });

  const groups: EntityGroup[] = [
    { label: "Programmes", icon: <Layers className="h-4 w-4" />, items: data?.programmes || [] },
    { label: "Projects", icon: <FolderKanban className="h-4 w-4" />, items: data?.projects || [] },
    { label: "Products", icon: <Package className="h-4 w-4" />, items: data?.products || [] },
  ];

  if (isLoading) {
    return (
      <div className="metric-card animate-slide-up">
        <h3 className="text-lg font-semibold text-foreground mb-4">Status Overview</h3>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const allEmpty = groups.every((g) => g.items.length === 0);

  return (
    <div className="metric-card animate-slide-up">
      <h3 className="text-lg font-semibold text-foreground mb-4">Status Overview</h3>
      {allEmpty ? (
        <div className="text-center py-8 text-muted-foreground">No entities to display.</div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) =>
            group.items.length > 0 ? (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2">
                  {group.icon}
                  <span className="text-sm font-medium text-foreground">{group.label}</span>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 pl-6">
                      <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", healthColor[item.health] || "bg-muted-foreground")} />
                      <span className="text-sm text-foreground truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

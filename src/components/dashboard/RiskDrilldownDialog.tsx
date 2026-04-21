import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, ExternalLink } from "lucide-react";

export type RiskImpactLevel = "high" | "medium" | "low";

interface Props {
  open: boolean;
  level: RiskImpactLevel | null;
  onOpenChange: (open: boolean) => void;
}

interface RiskRow {
  id: string;
  reference_number: string | null;
  title: string;
  description: string | null;
  status: string;
  probability: string | null;
  impact: string | null;
  owner_id: string | null;
  programme_id: string | null;
  project_id: string | null;
  product_id: string | null;
  updated_at: string;
}

const LEVEL_META: Record<RiskImpactLevel, { label: string; color: string; description: string }> = {
  high: {
    label: "High impact",
    color: "bg-destructive/10 text-destructive border-destructive/30",
    description: "Open risks scored as high impact. Drill into each one to view context, controls, and mitigation actions.",
  },
  medium: {
    label: "Medium impact",
    color: "bg-warning/10 text-warning border-warning/30",
    description: "Open risks with moderate impact. Review owners and update mitigation plans.",
  },
  low: {
    label: "Low impact",
    color: "bg-success/10 text-success border-success/30",
    description: "Open risks scored as low impact. Track for changes in likelihood or impact.",
  },
};

export function RiskDrilldownDialog({ open, level, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !level) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("risks")
        .select("id, reference_number, title, description, status, probability, impact, owner_id, programme_id, project_id, product_id, updated_at")
        .eq("status", "open")
        .eq("impact", level)
        .order("updated_at", { ascending: false });
      if (!cancelled) {
        if (error) console.error("Risk drilldown load error:", error);
        setRisks(data || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, level]);

  const meta = level ? LEVEL_META[level] : null;

  const goToRegister = () => {
    if (!level) return;
    navigate(`/registers/risks?impact=${level}&status=open`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {meta && (
              <Badge variant="outline" className={meta.color}>
                {meta.label}
              </Badge>
            )}
            <span>{risks.length} open risk{risks.length === 1 ? "" : "s"}</span>
          </DialogTitle>
          <DialogDescription>{meta?.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : risks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No open {level} impact risks.
            </div>
          ) : (
            <div className="space-y-2">
              {risks.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    navigate(`/registers/risks?focus=${r.id}`);
                    onOpenChange(false);
                  }}
                  className="w-full text-left rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-accent transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {r.reference_number && (
                          <span className="text-xs font-mono text-muted-foreground">{r.reference_number}</span>
                        )}
                        <span className="font-medium truncate">{r.title}</span>
                      </div>
                      {r.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {r.probability && <span>Probability: <strong className="capitalize">{r.probability}</strong></span>}
                        <span>Updated {new Date(r.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={goToRegister}>
            Open Risk Register
            <ExternalLink className="h-3.5 w-3.5 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

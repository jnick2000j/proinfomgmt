import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Flame, Shield, RefreshCw, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

interface Risk {
  id: string;
  title: string;
  probability: string;
  impact: string;
  score: number;
  status: string;
  category: string | null;
}

interface Suggestion {
  strategy: string;
  action: string;
  owner_role: string;
  effort: string;
  rationale: string;
}

const PROB = { "very-low": 1, low: 2, medium: 3, high: 4, "very-high": 5 } as const;

const heatColor = (score: number, count: number) => {
  if (count === 0) return "bg-muted/30";
  if (score >= 15) return "bg-destructive/80 text-destructive-foreground";
  if (score >= 9) return "bg-warning/70 text-warning-foreground";
  if (score >= 4) return "bg-warning/30";
  return "bg-success/30";
};

const strategyColor: Record<string, string> = {
  avoid: "bg-destructive/10 text-destructive border-destructive/30",
  reduce: "bg-warning/10 text-warning-foreground border-warning/30",
  transfer: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  accept: "bg-muted text-muted-foreground border-border",
  share: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  exploit: "bg-success/10 text-success border-success/30",
};

export function RiskInsightsPanel({ risks }: { risks: Risk[] }) {
  const { currentOrganization } = useOrganization();
  const [narrative, setNarrative] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // Build heat-map grid (probability rows 5→1, impact columns 1→5)
  const grid: { prob: number; impact: number; count: number; risks: Risk[] }[][] = [];
  for (let p = 5; p >= 1; p--) {
    const row = [];
    for (let i = 1; i <= 5; i++) {
      const cellRisks = risks.filter(
        (r) => (PROB[r.probability as keyof typeof PROB] ?? 3) === p && (PROB[r.impact as keyof typeof PROB] ?? 3) === i
      );
      row.push({ prob: p, impact: i, count: cellRisks.length, risks: cellRisks });
    }
    grid.push(row);
  }

  const generateNarrative = async () => {
    if (!currentOrganization) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("risk-insights", {
        body: { organization_id: currentOrganization.id, mode: "narrative" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setNarrative((data as any).narrative);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate narrative");
    } finally {
      setGenerating(false);
    }
  };

  const generateSuggestions = async (riskId: string) => {
    if (!currentOrganization) return;
    setSelectedRiskId(riskId);
    setSuggesting(true);
    setSuggestions(null);
    try {
      const { data, error } = await supabase.functions.invoke("risk-insights", {
        body: { organization_id: currentOrganization.id, mode: "mitigation", risk_id: riskId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSuggestions((data as any).suggestions ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate suggestions");
    } finally {
      setSuggesting(false);
    }
  };

  const topRisks = [...risks].sort((a, b) => b.score - a.score).slice(0, 5);
  const selectedRisk = risks.find((r) => r.id === selectedRiskId);

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Risk Insights</h2>
            <p className="text-sm text-muted-foreground">
              AI-powered heat-map narrative and mitigation strategies
            </p>
          </div>
        </div>
        <Button onClick={generateNarrative} disabled={generating || risks.length === 0} size="sm">
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : narrative ? <RefreshCw className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {narrative ? "Regenerate Narrative" : "Generate Narrative"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        {/* Heat-map grid */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5" /> Heat-map (Probability × Impact)
          </div>
          <div className="flex gap-1">
            <div className="flex flex-col justify-around text-[10px] text-muted-foreground pr-1 py-1">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="h-10 flex items-center">P{n}</div>
              ))}
            </div>
            <div>
              <div className="grid grid-cols-5 gap-1">
                {grid.flat().map((cell, idx) => {
                  const score = cell.prob * cell.impact;
                  return (
                    <div
                      key={idx}
                      className={`h-10 w-10 rounded flex items-center justify-center text-xs font-semibold border border-border/50 ${heatColor(score, cell.count)}`}
                      title={`P${cell.prob} × I${cell.impact} (score ${score}) — ${cell.count} risk(s)`}
                    >
                      {cell.count > 0 ? cell.count : ""}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-5 gap-1 mt-1 text-[10px] text-muted-foreground">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="w-10 text-center">I{n}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-success/50" />Low</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-warning/40" />Medium</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-warning/70" />High</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-destructive/80" />Critical</span>
          </div>
        </div>

        {/* Narrative */}
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" /> Executive Narrative
          </div>
          {narrative ? (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {narrative}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed bg-muted/10 p-6 text-sm text-muted-foreground text-center">
              {risks.length === 0
                ? "No risks to analyse yet."
                : "Click Generate Narrative to get an AI-written summary of your risk posture."}
            </div>
          )}
        </div>
      </div>

      {/* Top risks → mitigation suggestions */}
      {topRisks.length > 0 && (
        <div className="mt-6 pt-5 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Top Risks — get AI mitigation suggestions
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {topRisks.map((r) => (
              <Button
                key={r.id}
                variant={selectedRiskId === r.id ? "default" : "outline"}
                size="sm"
                onClick={() => generateSuggestions(r.id)}
                disabled={suggesting}
                className="gap-2"
              >
                <span className="truncate max-w-[200px]">{r.title}</span>
                <Badge variant="secondary" className="text-[10px]">{r.score}</Badge>
              </Button>
            ))}
          </div>

          {suggesting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analysing {selectedRisk?.title}...
            </div>
          )}

          {!suggesting && suggestions && selectedRisk && (
            <div>
              <div className="text-sm mb-3">
                Suggestions for <span className="font-medium">{selectedRisk.title}</span>:
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={`uppercase text-[10px] ${strategyColor[s.strategy] ?? ""}`}>
                        {s.strategy}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {s.effort} effort
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{s.action}</p>
                    <p className="text-xs text-muted-foreground italic">Owner: {s.owner_role}</p>
                    <p className="text-xs text-muted-foreground">{s.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

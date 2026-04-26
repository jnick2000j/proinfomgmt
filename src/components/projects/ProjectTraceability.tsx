import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Gavel, Award as AwardIcon, FolderKanban, ArrowRight, Clock } from "lucide-react";
import { format } from "date-fns";

interface ProjectTraceabilityProps {
  project: {
    id: string;
    name: string;
    stage: string;
    created_at: string;
    source_rfp_id?: string | null;
    source_bid_id?: string | null;
    source_award_id?: string | null;
    source_opportunity_id?: string | null;
  };
}

interface SourceRecord {
  id: string;
  record_number: string | null;
  title: string;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export function ProjectTraceability({ project }: ProjectTraceabilityProps) {
  const ids = [
    project.source_opportunity_id,
    project.source_rfp_id,
    project.source_bid_id,
    project.source_award_id,
  ].filter(Boolean) as string[];

  const { data: sources = [] } = useQuery({
    queryKey: ["project-trace-sources", project.id, ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("vertical_entity_records")
        .select("id, record_number, title, status, created_at, updated_at, entity_id, vertical_entities(slug, name)")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byId = new Map(sources.map((s: any) => [s.id, s]));
  const opportunity = project.source_opportunity_id ? byId.get(project.source_opportunity_id) : null;
  const rfp = project.source_rfp_id ? byId.get(project.source_rfp_id) : null;
  const bid = project.source_bid_id ? byId.get(project.source_bid_id) : null;
  const award = project.source_award_id ? byId.get(project.source_award_id) : null;

  const hasAnySource = !!(opportunity || rfp || bid || award);

  const Step = ({
    icon: Icon, label, record, fallback,
  }: { icon: any; label: string; record: any; fallback?: string }) => (
    <div className="flex-1 min-w-[180px]">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`p-1.5 rounded-md ${record ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      {record ? (
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            {record.record_number && <span className="text-xs font-mono text-muted-foreground">{record.record_number}</span>}
            {record.status && <Badge variant="outline" className="text-xs">{record.status}</Badge>}
          </div>
          <div className="text-sm font-medium line-clamp-2">{record.title}</div>
          <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(record.created_at), "MMM d, yyyy")}
          </div>
        </Card>
      ) : (
        <Card className="p-3 border-dashed text-xs text-muted-foreground">
          {fallback ?? "Not linked"}
        </Card>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source Traceability</CardTitle>
        <CardDescription>
          Full lineage from initial opportunity → RFP → bid/decision → award → this delivery project.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAnySource && (
          <div className="text-sm text-muted-foreground bg-muted/40 p-4 rounded-md mb-4">
            This project has no linked source records. Link an RFP, bid or award from the construction registers
            to capture the full origin chain.
          </div>
        )}

        <div className="flex flex-wrap items-stretch gap-3">
          <Step icon={FileText}     label="Opportunity"      record={opportunity} fallback="No opportunity" />
          <ArrowSep />
          <Step icon={FileText}     label="RFP"              record={rfp}         fallback="No RFP" />
          <ArrowSep />
          <Step icon={Gavel}        label="Bid / Decision"   record={bid}         fallback="No bid" />
          <ArrowSep />
          <Step icon={AwardIcon}    label="Award"            record={award}       fallback="No award" />
          <ArrowSep />
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600">
                <FolderKanban className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery Project</span>
            </div>
            <Card className="p-3 border-emerald-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="default" className="text-xs capitalize">{project.stage}</Badge>
              </div>
              <div className="text-sm font-medium line-clamp-2">{project.name}</div>
              <div className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Created {format(new Date(project.created_at), "MMM d, yyyy")}
              </div>
            </Card>
          </div>
        </div>

        {/* Vertical timeline (text) */}
        {hasAnySource && (
          <div className="mt-6 pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold mb-2">Timeline</h4>
            {opportunity && <TimelineRow label="Opportunity created" record={opportunity} />}
            {rfp && <TimelineRow label="RFP issued" record={rfp} />}
            {bid && <TimelineRow label="Bid / decision recorded" record={bid} />}
            {award && <TimelineRow label="Contract awarded" record={award} />}
            <TimelineRow label="Delivery project created" record={{ created_at: project.created_at, status: project.stage, title: project.name } as any} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArrowSep() {
  return (
    <div className="hidden md:flex items-center pt-7 text-muted-foreground">
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}

function TimelineRow({ label, record }: { label: string; record: any }) {
  return (
    <div className="flex items-center justify-between text-xs gap-2 py-1">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground truncate">— {record.title}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
        {record.status && <Badge variant="outline" className="text-[10px]">{record.status}</Badge>}
        <span>{format(new Date(record.created_at), "MMM d, yyyy")}</span>
      </div>
    </div>
  );
}

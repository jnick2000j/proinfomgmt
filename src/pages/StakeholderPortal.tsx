import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Eye, FileText, ShieldCheck, Building2, Layers, FolderKanban } from "lucide-react";

type PortalAccess = {
  id: string;
  organization_id: string;
  scope_type: "programme" | "project" | "organization";
  scope_id: string;
  expires_at: string | null;
};

type Org = { id: string; name: string };
type Entity = { id: string; name: string; description: string | null; status: string | null };

type Report = {
  id: string;
  title: string;
  report_type: string;
  scope_type: string;
  scope_id: string;
  period_start: string | null;
  period_end: string | null;
  published_at: string | null;
  content: Record<string, unknown>;
};

type Score = {
  scope_type: string;
  scope_id: string;
  score: number;
  controls_score: number;
  cadence_score: number;
  hygiene_score: number;
  computed_at: string;
};

const REPORT_LABELS: Record<string, string> = {
  highlight: "Highlight Report",
  end_stage: "End Stage Report",
  programme_status: "Programme Status Report",
};

export default function StakeholderPortal() {
  const { user } = useAuth();
  const [accesses, setAccesses] = useState<PortalAccess[]>([]);
  const [orgs, setOrgs] = useState<Record<string, Org>>({});
  const [programmes, setProgrammes] = useState<Record<string, Entity>>({});
  const [projects, setProjects] = useState<Record<string, Entity>>({});
  const [reports, setReports] = useState<Report[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchAll = async () => {
      setLoading(true);
      const { data: accessRows } = await supabase
        .from("stakeholder_portal_access")
        .select("*")
        .eq("user_id", user.id);
      const acc = (accessRows || []) as PortalAccess[];
      setAccesses(acc);

      if (acc.length === 0) {
        setLoading(false);
        return;
      }

      const orgIds = Array.from(new Set(acc.map((a) => a.organization_id)));
      const programmeIds = acc.filter((a) => a.scope_type === "programme").map((a) => a.scope_id);
      const projectIds = acc.filter((a) => a.scope_type === "project").map((a) => a.scope_id);

      const [orgsRes, progsRes, projsRes] = await Promise.all([
        supabase.from("organizations").select("id, name").in("id", orgIds),
        programmeIds.length > 0
          ? supabase.from("programmes").select("id, name, description, status").in("id", programmeIds)
          : Promise.resolve({ data: [] }),
        projectIds.length > 0
          ? supabase.from("projects").select("id, name, description, status").in("id", projectIds)
          : Promise.resolve({ data: [] }),
      ]);

      const orgMap: Record<string, Org> = {};
      (orgsRes.data || []).forEach((o: Org) => (orgMap[o.id] = o));
      setOrgs(orgMap);

      const progMap: Record<string, Entity> = {};
      (progsRes.data || []).forEach((p: Entity) => (progMap[p.id] = p));
      setProgrammes(progMap);

      const projMap: Record<string, Entity> = {};
      (projsRes.data || []).forEach((p: Entity) => (projMap[p.id] = p));
      setProjects(projMap);

      // Fetch published reports for all accessible scopes
      const scopePairs: Array<{ type: string; id: string }> = acc.map((a) => ({
        type: a.scope_type,
        id: a.scope_id,
      }));

      if (scopePairs.length > 0) {
        // Build OR filter for scope match
        const programmeScopeIds = scopePairs.filter((s) => s.type === "programme").map((s) => s.id);
        const projectScopeIds = scopePairs.filter((s) => s.type === "project").map((s) => s.id);

        const reportQueries: Promise<{ data: Report[] | null }>[] = [];
        if (programmeScopeIds.length > 0) {
          reportQueries.push(
            supabase
              .from("governance_reports")
              .select("id, title, report_type, scope_type, scope_id, period_start, period_end, published_at, content")
              .eq("scope_type", "programme")
              .in("scope_id", programmeScopeIds)
              .eq("status", "published")
              .order("published_at", { ascending: false }) as unknown as Promise<{ data: Report[] | null }>,
          );
        }
        if (projectScopeIds.length > 0) {
          reportQueries.push(
            supabase
              .from("governance_reports")
              .select("id, title, report_type, scope_type, scope_id, period_start, period_end, published_at, content")
              .eq("scope_type", "project")
              .in("scope_id", projectScopeIds)
              .eq("status", "published")
              .order("published_at", { ascending: false }) as unknown as Promise<{ data: Report[] | null }>,
          );
        }
        const reportResults = await Promise.all(reportQueries);
        const allReports = reportResults.flatMap((r) => r.data || []);
        setReports(allReports);

        // Fetch latest scores
        const scoreQueries = [];
        if (programmeScopeIds.length > 0) {
          scoreQueries.push(
            supabase
              .from("compliance_scores")
              .select("scope_type, scope_id, score, controls_score, cadence_score, hygiene_score, computed_at")
              .eq("scope_type", "programme")
              .in("scope_id", programmeScopeIds)
              .order("computed_at", { ascending: false }),
          );
        }
        if (projectScopeIds.length > 0) {
          scoreQueries.push(
            supabase
              .from("compliance_scores")
              .select("scope_type, scope_id, score, controls_score, cadence_score, hygiene_score, computed_at")
              .eq("scope_type", "project")
              .in("scope_id", projectScopeIds)
              .order("computed_at", { ascending: false }),
          );
        }
        const scoreResults = await Promise.all(scoreQueries);
        setScores(scoreResults.flatMap((r) => (r.data as Score[]) || []));
      }

      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const latestScoreFor = (scope_type: string, scope_id: string) => {
    return scores.find((s) => s.scope_type === scope_type && s.scope_id === scope_id);
  };

  const reportsForScope = (scope_type: string, scope_id: string) =>
    reports.filter((r) => r.scope_type === scope_type && r.scope_id === scope_id);

  const groupedAccesses = useMemo(() => {
    const byOrg = new Map<string, PortalAccess[]>();
    accesses.forEach((a) => {
      if (!byOrg.has(a.organization_id)) byOrg.set(a.organization_id, []);
      byOrg.get(a.organization_id)!.push(a);
    });
    return byOrg;
  }, [accesses]);

  const renderContentSection = (label: string, value: unknown) => {
    if (value == null || value === "") return null;
    if (Array.isArray(value)) {
      return (
        <div className="space-y-1">
          <h4 className="font-semibold text-sm">{label}</h4>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {value.map((v, i) => <li key={i}>{String(v)}</li>)}
          </ul>
        </div>
      );
    }
    return (
      <div className="space-y-1">
        <h4 className="font-semibold text-sm">{label}</h4>
        <p className="text-sm whitespace-pre-wrap">{String(value)}</p>
      </div>
    );
  };

  if (loading) {
    return (
      <AppLayout title="Stakeholder Portal">
        <div className="p-6 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  if (accesses.length === 0) {
    return (
      <AppLayout title="Stakeholder Portal" subtitle="Read-only access to programmes and projects you've been granted">
        <div className="p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Eye className="h-6 w-6 text-muted-foreground" />
                <CardTitle>No stakeholder access yet</CardTitle>
              </div>
              <CardDescription>
                You haven't been granted stakeholder access to any programmes or projects. Ask an organization admin to add you.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Stakeholder Portal"
      subtitle="Read-only programme & project status, published reports, and compliance"
    >
      <div className="p-6 space-y-6">
        {Array.from(groupedAccesses.entries()).map(([orgId, orgAccesses]) => (
          <Card key={orgId}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle>{orgs[orgId]?.name || "Organization"}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={orgAccesses[0].scope_type}>
                <TabsList>
                  {orgAccesses.some((a) => a.scope_type === "programme") && (
                    <TabsTrigger value="programme">
                      <Layers className="h-4 w-4 mr-2" /> Programmes
                    </TabsTrigger>
                  )}
                  {orgAccesses.some((a) => a.scope_type === "project") && (
                    <TabsTrigger value="project">
                      <FolderKanban className="h-4 w-4 mr-2" /> Projects
                    </TabsTrigger>
                  )}
                </TabsList>

                {(["programme", "project"] as const).map((scopeType) => (
                  <TabsContent key={scopeType} value={scopeType} className="mt-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      {orgAccesses
                        .filter((a) => a.scope_type === scopeType)
                        .map((access) => {
                          const entity = scopeType === "programme"
                            ? programmes[access.scope_id]
                            : projects[access.scope_id];
                          if (!entity) return null;
                          const score = latestScoreFor(scopeType, access.scope_id);
                          const entityReports = reportsForScope(scopeType, access.scope_id);
                          return (
                            <Card key={access.id} className="border-l-4 border-l-primary/40">
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <CardTitle className="text-base truncate">{entity.name}</CardTitle>
                                    {entity.status && (
                                      <Badge variant="outline" className="mt-1">{entity.status}</Badge>
                                    )}
                                  </div>
                                  {score && (
                                    <div className="text-right">
                                      <div className="flex items-center gap-1">
                                        <ShieldCheck className="h-4 w-4 text-success" />
                                        <span className="text-2xl font-bold">{score.score}</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground">compliance</p>
                                    </div>
                                  )}
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {entity.description && (
                                  <p className="text-sm text-muted-foreground line-clamp-2">{entity.description}</p>
                                )}
                                {score && (
                                  <div>
                                    <Progress value={score.score} />
                                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                                      <span>Controls {score.controls_score}</span>
                                      <span>Cadence {score.cadence_score}</span>
                                      <span>Hygiene {score.hygiene_score}</span>
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    Published reports ({entityReports.length})
                                  </p>
                                  {entityReports.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No published reports yet</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {entityReports.slice(0, 3).map((r) => (
                                        <button
                                          key={r.id}
                                          onClick={() => setActiveReport(r)}
                                          className="block w-full text-left text-xs hover:bg-secondary rounded px-2 py-1 transition-colors"
                                        >
                                          <span className="font-medium">{REPORT_LABELS[r.report_type] || r.report_type}</span>
                                          <span className="text-muted-foreground ml-2">
                                            {r.published_at && format(new Date(r.published_at), "PP")}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        ))}

        <Sheet open={!!activeReport} onOpenChange={(open) => !open && setActiveReport(null)}>
          <SheetContent className="sm:max-w-3xl overflow-y-auto">
            {activeReport && (
              <>
                <SheetHeader>
                  <SheetTitle>{activeReport.title}</SheetTitle>
                  <SheetDescription>
                    {activeReport.period_start} → {activeReport.period_end}
                    {activeReport.published_at && ` · Published ${format(new Date(activeReport.published_at), "PP")}`}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-4">
                  {Object.entries(activeReport.content || {}).map(([k, v]) => (
                    <div key={k}>
                      {renderContentSection(
                        k.split("_").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" "),
                        v,
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </AppLayout>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, Eye, EyeOff, FileText } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { ReportDownloader } from "./ReportDownloader";
import ReactMarkdown from "react-markdown";

export function SavedReports() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["saved-reports", currentOrganization?.id],
    queryFn: async () => {
      let query = supabase
        .from("saved_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (currentOrganization?.id) {
        query = query.eq("organization_id", currentOrganization.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("saved_reports").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Could not delete report.", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Report removed." });
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading saved reports...</div>;
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No saved reports yet.</p>
        <p className="text-xs mt-1">Generate an AI report and click "Save" to keep it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <Card key={report.id} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <CardTitle className="text-sm truncate">{report.title}</CardTitle>
                {report.template_key && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Template</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ReportDownloader content={report.content} title={report.title} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                >
                  {expandedId === report.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(report.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(report.created_at).toLocaleDateString()} · Query: {report.query.length > 80 ? report.query.substring(0, 80) + "..." : report.query}
            </p>
          </CardHeader>
          {expandedId === report.id && (
            <CardContent>
              <ScrollArea className="max-h-[400px]">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{report.content}</ReactMarkdown>
                </div>
              </ScrollArea>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

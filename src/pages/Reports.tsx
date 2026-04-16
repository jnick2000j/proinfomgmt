import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  Download,
  FileText,
  Mail,
  Sparkles,
  Send,
  Loader2,
  Copy,
  RotateCcw
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend } from "recharts";
import { toast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";

const resourceColors = [
  "hsl(217, 91%, 50%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(280, 65%, 60%)",
  "hsl(199, 89%, 48%)",
];

const suggestedQueries = [
  "Give me an executive summary of all programmes and their status",
  "Show me a risk analysis with the highest priority risks across all projects",
  "What are the overdue milestones and their impact?",
  "Provide a benefits realization report with progress percentages",
  "List all open issues grouped by project with recommendations",
  "Generate a stakeholder engagement report",
  "Show task completion rates by project",
  "Summarize all change requests and their current status",
];

export default function Reports() {
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [reportType, setReportType] = useState("executive-summary");
  const [frequency, setFrequency] = useState("weekly");
  
  // AI Report state
  const [reportQuery, setReportQuery] = useState("");
  const [reportContent, setReportContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showReportBuilder, setShowReportBuilder] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch real data from database
  const { data: programmes = [] } = useQuery({
    queryKey: ["programmes-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("id, name, status, progress");
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, programme_id, health");
      if (error) throw error;
      return data;
    },
  });

  const { data: benefits = [] } = useQuery({
    queryKey: ["benefits-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("benefits").select("id, category, realization, target_value, current_value");
      if (error) throw error;
      return data;
    },
  });

  const { data: risks = [] } = useQuery({
    queryKey: ["risks-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("risks").select("id, status, impact, probability");
      if (error) throw error;
      return data;
    },
  });

  const programmeData = programmes.map(prog => {
    const progProjects = projects.filter(p => p.programme_id === prog.id);
    return {
      name: prog.name.length > 15 ? prog.name.substring(0, 15) + "..." : prog.name,
      onTrack: progProjects.filter(p => p.health === "green").length,
      atRisk: progProjects.filter(p => p.health === "amber").length,
      delayed: progProjects.filter(p => p.health === "red").length,
    };
  }).filter(p => p.onTrack + p.atRisk + p.delayed > 0);

  const benefitsByCategory = benefits.reduce((acc, benefit) => {
    const cat = benefit.category || "Other";
    if (!acc[cat]) acc[cat] = { target: 0, actual: 0 };
    acc[cat].target += parseInt(benefit.target_value || "0") || 0;
    acc[cat].actual += parseInt(benefit.current_value || "0") || 0;
    return acc;
  }, {} as Record<string, { target: number; actual: number }>);

  const benefitsTrendData = Object.entries(benefitsByCategory).map(([name, values]) => ({
    month: name,
    target: values.target,
    actual: values.actual,
  }));

  const riskCategories = risks.reduce((acc, risk) => {
    const status = risk.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const resourceAllocation = Object.entries(riskCategories).map(([name, value], index) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: resourceColors[index % resourceColors.length],
  }));

  const handleGenerateAIReport = async (queryText?: string) => {
    const q = queryText || reportQuery;
    if (!q.trim()) {
      toast({ title: "Please enter a query", description: "Describe what report you'd like to generate.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setReportContent("");
    setShowReportBuilder(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ query: q }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${resp.status})`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setReportContent(fullContent);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setReportContent(fullContent);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") return;
      console.error("Report generation error:", error);
      toast({
        title: "Report generation failed",
        description: error.message || "An error occurred while generating the report.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportContent);
    toast({ title: "Copied", description: "Report copied to clipboard." });
  };

  const handleDownloadReport = () => {
    const blob = new Blob([reportContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `custom-report-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Report saved as markdown file." });
  };

  const handleGenerateReport = () => {
    toast({ title: "Generating report...", description: "Your report is being generated and will download shortly." });
    const reportContentText = `
Program Portfolio Report
Generated: ${new Date().toLocaleDateString()}

Summary:
- Total Programs: ${programmes.length}
- Total Projects: ${projects.length}
- Open Risks: ${risks.filter(r => r.status === "open").length}
- Benefits Tracked: ${benefits.length}

Program Status:
${programmes.map(p => `- ${p.name}: ${p.status} (${p.progress}% complete)`).join("\n")}
    `.trim();

    const blob = new Blob([reportContentText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `programme-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report downloaded", description: "Your programme report has been downloaded." });
  };

  const handleScheduleEmail = () => setScheduleDialogOpen(true);

  const handleExportData = async () => {
    toast({ title: "Exporting data...", description: "Preparing your data export." });
    const exportData = { exportedAt: new Date().toISOString(), programmes, projects, risks, benefits };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-data-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Data exported", description: "All portfolio data has been exported as JSON." });
  };

  const handleSaveSchedule = () => {
    if (!emailTo) {
      toast({ title: "Error", description: "Please enter an email address.", variant: "destructive" });
      return;
    }
    toast({ title: "Report scheduled", description: `${reportType} report will be sent ${frequency} to ${emailTo}.` });
    setScheduleDialogOpen(false);
    setEmailTo("");
  };

  return (
    <AppLayout title="Reports & Analytics" subtitle="Program insights, automated reporting, and AI-powered custom reports">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button className="gap-2" variant={showReportBuilder ? "default" : "outline"} onClick={() => setShowReportBuilder(!showReportBuilder)}>
          <Sparkles className="h-4 w-4" />
          AI Report Builder
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleGenerateReport}>
          <FileText className="h-4 w-4" />
          Quick Report
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleScheduleEmail}>
          <Mail className="h-4 w-4" />
          Schedule Email
        </Button>
        <Button variant="outline" className="gap-2" onClick={handleExportData}>
          <Download className="h-4 w-4" />
          Export All Data
        </Button>
      </div>

      {/* AI Report Builder */}
      {showReportBuilder && (
        <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Custom Report Builder
            </CardTitle>
            <CardDescription>
              Ask any question about your portfolio data and get an AI-generated report instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Query Input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="e.g. Give me a risk analysis across all projects with recommendations..."
                value={reportQuery}
                onChange={(e) => setReportQuery(e.target.value)}
                className="min-h-[80px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateAIReport();
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleGenerateAIReport()}
                  disabled={isGenerating || !reportQuery.trim()}
                  className="gap-2"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Generate
                </Button>
                {isGenerating && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => abortControllerRef.current?.abort()}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Suggested Queries */}
            <div className="flex flex-wrap gap-2">
              {suggestedQueries.map((sq, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 transition-colors text-xs"
                  onClick={() => {
                    setReportQuery(sq);
                    handleGenerateAIReport(sq);
                  }}
                >
                  {sq.length > 50 ? sq.substring(0, 50) + "..." : sq}
                </Badge>
              ))}
            </div>

            {/* Report Output */}
            {(reportContent || isGenerating) && (
              <div className="border rounded-lg bg-card">
                <div className="flex items-center justify-between px-4 py-2 border-b">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {isGenerating && <Loader2 className="h-3 w-3 animate-spin" />}
                    {isGenerating ? "Generating report..." : "Generated Report"}
                  </span>
                  {reportContent && !isGenerating && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={handleCopyReport}>
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={handleDownloadReport}>
                        <Download className="h-3 w-3" /> Download
                      </Button>
                      <Button variant="ghost" size="sm" className="gap-1 h-7" onClick={() => { setReportContent(""); setReportQuery(""); }}>
                        <RotateCcw className="h-3 w-3" /> Reset
                      </Button>
                    </div>
                  )}
                </div>
                <ScrollArea className="max-h-[500px]">
                  <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{reportContent || "..."}</ReactMarkdown>
                  </div>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Project Status by Program</h3>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="h-[300px]">
            {programmeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={programmeData} layout="vertical" barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Bar dataKey="onTrack" name="On Track" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="atRisk" name="At Risk" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="delayed" name="Delayed" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No programme data available. Create programmes and projects to see statistics.
              </div>
            )}
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Benefits by Category</h3>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="h-[300px]">
            {benefitsTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benefitsTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No benefits data available. Add benefits to see trends.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        <div className="metric-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Risk Distribution</h3>
            <PieChart className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="h-[250px]">
            {resourceAllocation.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie data={resourceAllocation} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {resourceAllocation.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend />
                </RechartsPie>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No risk data available.
              </div>
            )}
          </div>
        </div>

        <div className="metric-card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Portfolio Summary</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-primary/10 text-center">
              <p className="text-3xl font-bold text-primary">{programmes.length}</p>
              <p className="text-sm text-muted-foreground">Programs</p>
            </div>
            <div className="p-4 rounded-lg bg-success/10 text-center">
              <p className="text-3xl font-bold text-success">{projects.length}</p>
              <p className="text-sm text-muted-foreground">Projects</p>
            </div>
            <div className="p-4 rounded-lg bg-warning/10 text-center">
              <p className="text-3xl font-bold text-warning">{risks.filter(r => r.status === "open").length}</p>
              <p className="text-sm text-muted-foreground">Open Risks</p>
            </div>
            <div className="p-4 rounded-lg bg-info/10 text-center">
              <p className="text-3xl font-bold text-info">{benefits.length}</p>
              <p className="text-sm text-muted-foreground">Benefits</p>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Email Dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Email Report</DialogTitle>
            <DialogDescription>Configure automated email reports for stakeholders.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive-summary">Executive Summary</SelectItem>
                  <SelectItem value="risk-dashboard">Risk Dashboard</SelectItem>
                  <SelectItem value="benefits-tracker">Benefits Tracker</SelectItem>
                  <SelectItem value="project-status">Project Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" placeholder="stakeholder@company.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSchedule}>Schedule Report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

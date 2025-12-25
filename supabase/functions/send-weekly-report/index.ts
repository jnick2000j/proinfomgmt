import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Generating weekly report...");

    // Get all programmes
    const { data: programmes, error: progError } = await supabase
      .from("programmes")
      .select("*")
      .eq("status", "active");

    if (progError) throw progError;

    // Get open risks
    const { data: risks, error: riskError } = await supabase
      .from("risks")
      .select("*")
      .in("status", ["open", "mitigating"]);

    if (riskError) throw riskError;

    // Get open issues
    const { data: issues, error: issueError } = await supabase
      .from("issues")
      .select("*")
      .in("status", ["open", "investigating", "pending"]);

    if (issueError) throw issueError;

    // Get benefits
    const { data: benefits, error: benefitError } = await supabase
      .from("benefits")
      .select("*");

    if (benefitError) throw benefitError;

    // Calculate summary stats
    const highRisks = risks?.filter(r => r.score >= 15).length || 0;
    const criticalIssues = issues?.filter(i => i.priority === "critical" || i.priority === "high").length || 0;
    const avgRealization = benefits?.length 
      ? Math.round(benefits.reduce((acc, b) => acc + (b.realization || 0), 0) / benefits.length)
      : 0;

    // Generate report content
    const reportContent = {
      generatedAt: new Date().toISOString(),
      summary: {
        activeProgrammes: programmes?.length || 0,
        openRisks: risks?.length || 0,
        highPriorityRisks: highRisks,
        openIssues: issues?.length || 0,
        criticalIssues: criticalIssues,
        avgBenefitRealization: avgRealization,
      },
      programmes: programmes?.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        progress: p.progress,
      })),
      topRisks: risks?.filter(r => r.score >= 12).slice(0, 5).map(r => ({
        id: r.id,
        title: r.title,
        score: r.score,
        status: r.status,
      })),
      criticalIssuesList: issues?.filter(i => i.priority === "critical" || i.priority === "high").slice(0, 5).map(i => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
        status: i.status,
      })),
    };

    console.log("Weekly report generated:", JSON.stringify(reportContent, null, 2));

    // In a real implementation, you would:
    // 1. Get stakeholder emails from the database
    // 2. Use Resend or another email service to send the report
    // For now, we'll just return the report data

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Weekly report generated successfully",
      report: reportContent 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating weekly report:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

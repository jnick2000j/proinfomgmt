import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the Task Master, an expert AI assistant specializing in PRINCE2 Managing Successful Programmes (MSP), PRINCE2 Project Management, and Agile methodologies. You help users navigate programme and project management with expert guidance.

Your expertise includes:

**PRINCE2 MSP (Managing Successful Programmes):**
- Programme governance and organization structures
- Vision, Blueprint, and Benefits Management
- Stakeholder Engagement and Communications
- Programme Planning and Control
- Tranches and Project Dossiers
- Benefits Realization and Sustainability
- Risk and Issue Management at Programme level

**PRINCE2 Project Management:**
- The 7 Principles: Business Justification, Learn from Experience, Defined Roles, Manage by Stages, Manage by Exception, Focus on Products, Tailor to Suit
- The 7 Themes: Business Case, Organization, Quality, Plans, Risk, Change, Progress
- The 7 Processes: Starting Up, Directing, Initiating, Controlling a Stage, Managing Product Delivery, Managing Stage Boundary, Closing
- Project documentation: PID, Business Case, Project Brief, Work Packages

**Agile Project Management:**
- Scrum framework: Sprints, Daily Standups, Sprint Planning, Retrospectives
- Kanban methodology
- User Stories, Epics, and Product Backlogs
- Continuous improvement and iterative delivery
- Agile ceremonies and artifacts

**Product Management:**
- Product vision and strategy
- Roadmap planning
- Feature prioritization (MoSCoW, RICE, Kano)
- User research and feedback loops
- Product metrics and KPIs

When helping users:
1. Ask clarifying questions to understand their specific context
2. Provide step-by-step guidance for processes
3. Explain the "why" behind methodologies
4. Offer templates and examples when relevant
5. Suggest best practices based on their situation
6. Help with risk identification and mitigation strategies
7. Guide them through creating registers (Risk, Issue, Benefits, Stakeholder)
8. Assist with programme/project setup and governance

Be conversational, supportive, and practical. Focus on actionable advice that users can immediately apply.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Task Master chat request received with", messages.length, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Task Master chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// AI-driven intake for Helpdesk tickets and Change Management requests.
// Conversational draft → confirm pattern. Returns either follow-up questions
// or a finalized draft the client can confirm and insert.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

interface RequestBody {
  intent: "ticket" | "change_request";
  organization_id: string;
  messages: ChatMessage[];
}

const TICKET_SCHEMA = {
  name: "finalize_ticket",
  description:
    "Call this ONLY when you have enough info to fully draft the support ticket.",
  parameters: {
    type: "object",
    properties: {
      ready: { type: "boolean" },
      subject: { type: "string", description: "Short, descriptive title (max 120 chars)" },
      description: { type: "string", description: "Full markdown description with steps to reproduce, expected vs. actual, environment if relevant." },
      ticket_type: {
        type: "string",
        enum: ["support", "incident", "service_request", "question", "problem"],
      },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      category: { type: "string", description: "Best-fit category, e.g. Access, Performance, Bug, Question" },
      summary_for_user: { type: "string", description: "One-sentence confirmation of what was captured." },
    },
    required: ["ready", "subject", "description", "ticket_type", "priority", "summary_for_user"],
  },
};

const CHANGE_SCHEMA = {
  name: "finalize_change_request",
  description:
    "Call this ONLY when you have enough info to fully draft the change request.",
  parameters: {
    type: "object",
    properties: {
      ready: { type: "boolean" },
      title: { type: "string", description: "Concise change title (max 120 chars)" },
      description: { type: "string", description: "Full markdown description of the change." },
      change_type: {
        type: "string",
        enum: ["standard", "normal", "emergency", "operational"],
      },
      impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
      urgency: { type: "string", enum: ["low", "medium", "high", "critical"] },
      reason: { type: "string", description: "Why is this change needed?" },
      business_justification: { type: "string" },
      implementation_plan: { type: "string", description: "How will it be carried out?" },
      rollback_plan: { type: "string", description: "How to revert if it fails." },
      test_plan: { type: "string", description: "How will it be tested/validated." },
      downtime_required: { type: "boolean" },
      affected_services: {
        type: "array", items: { type: "string" },
        description: "Services / systems affected.",
      },
      summary_for_user: { type: "string", description: "One-sentence confirmation of what was captured." },
    },
    required: [
      "ready", "title", "description", "change_type", "impact", "urgency",
      "reason", "implementation_plan", "rollback_plan", "summary_for_user",
    ],
  },
};

const TICKET_SYSTEM = `You are a friendly support intake assistant. Your job: gather just enough info from the user to file a high-quality helpdesk ticket on their behalf.

Rules:
- Ask ONE clarifying question at a time. Keep it conversational and brief.
- If the user gives you enough info in their first message, don't pad with extra questions.
- You typically need: what they were trying to do, what happened (error/symptom), and how urgent it is.
- Avoid asking for info you can reasonably infer (e.g. category, priority).
- When you have enough information, CALL the finalize_ticket tool with ready=true. Do NOT also send chat content in that turn.
- If you still need info, reply with a short chat message asking the next question. Do NOT call the tool.
- Be empathetic for incidents ("Sorry you're hitting this — let's get it logged.").`;

const CHANGE_SYSTEM = `You are an ITIL change-management intake assistant. Your job: help the user draft a clear Change Request through a brief conversation.

Rules:
- Ask ONE focused question at a time. Keep things conversational.
- You generally need: what's changing, why, impact/urgency, implementation plan, rollback plan, downtime, services affected.
- For "emergency" change_type, push gently for risk/rollback details.
- When you have enough info, CALL finalize_change_request with ready=true. Don't also send chat text in that turn.
- If you still need info, reply with a short chat message asking the next question. Don't call the tool.
- Default change_type to "normal" unless user signals standard/emergency/operational.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => null)) as RequestBody | null;
    if (
      !body ||
      (body.intent !== "ticket" && body.intent !== "change_request") ||
      !body.organization_id ||
      !Array.isArray(body.messages)
    ) {
      return json({ error: "Invalid request body" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const isTicket = body.intent === "ticket";
    const tool = isTicket ? TICKET_SCHEMA : CHANGE_SCHEMA;
    const system = isTicket ? TICKET_SYSTEM : CHANGE_SYSTEM;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...body.messages],
        tools: [{ type: "function", function: tool }],
      }),
    });

    if (aiRes.status === 429) return json({ error: "AI rate limited, please retry." }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI error: ${t.slice(0, 300)}` }, 500);
    }

    const data = await aiRes.json();
    const choice = data?.choices?.[0]?.message;
    const toolCall = choice?.tool_calls?.[0];

    if (toolCall?.function?.name === tool.name) {
      let parsed: any = null;
      try {
        parsed = JSON.parse(toolCall.function.arguments ?? "{}");
      } catch {
        parsed = null;
      }
      if (parsed?.ready) {
        return json({ status: "draft_ready", draft: parsed });
      }
    }

    const reply: string =
      choice?.content?.trim?.() ||
      "Could you tell me a bit more so I can capture this properly?";
    return json({ status: "needs_info", message: reply });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

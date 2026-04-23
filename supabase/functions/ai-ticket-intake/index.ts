// AI-driven intake for Helpdesk tickets and Change Management requests.
// Conversational draft → confirm pattern. Returns either follow-up questions,
// suggested KB articles, or a finalized draft the client can confirm and insert.
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
  /** Article ids the user has already been shown — don't re-suggest. */
  shown_article_ids?: string[];
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

const KB_SEARCH_SCHEMA = {
  name: "search_knowledgebase",
  description:
    "Search the organization's knowledgebase for articles that may already answer the user's issue. Call this BEFORE drafting a ticket if the user describes a problem that might have a known solution. Do NOT call for change requests.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A focused natural-language query summarising the user's issue.",
      },
    },
    required: ["query"],
  },
};

const TICKET_SYSTEM = `You are a friendly support intake assistant. Your job: help the user resolve their issue OR file a high-quality helpdesk ticket on their behalf.

Workflow:
1. After the user describes their problem, FIRST call the search_knowledgebase tool with a focused query to look for existing answers. Do this on the very first user turn unless the request is purely transactional (e.g. "please reset my password").
2. If high-confidence articles come back, briefly mention them to the user (1–2 sentences) and ask whether one of those solves it before continuing.
3. If the user says the articles don't help, or no good matches are found, continue gathering info:
   - Ask ONE clarifying question at a time. Keep it conversational and brief.
   - You typically need: what they were trying to do, what happened (error/symptom), and how urgent it is.
   - Avoid asking for info you can reasonably infer (e.g. category, priority).
4. When you have enough information, CALL the finalize_ticket tool with ready=true. Do NOT also send chat content in that turn.
5. If you still need info, reply with a short chat message asking the next question. Do NOT call any tool that turn.
6. Be empathetic for incidents ("Sorry you're hitting this — let's get it logged.").

Never call search_knowledgebase more than twice in a single conversation.`;

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
    const finalizeTool = isTicket ? TICKET_SCHEMA : CHANGE_SCHEMA;
    const tools = isTicket
      ? [
          { type: "function", function: KB_SEARCH_SCHEMA },
          { type: "function", function: finalizeTool },
        ]
      : [{ type: "function", function: finalizeTool }];
    const system = isTicket ? TICKET_SYSTEM : CHANGE_SYSTEM;
    const shownIds = new Set(body.shown_article_ids ?? []);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...body.messages],
        tools,
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

    // Finalize?
    if (toolCall?.function?.name === finalizeTool.name) {
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

    // KB search?
    if (isTicket && toolCall?.function?.name === KB_SEARCH_SCHEMA.name) {
      let args: any = {};
      try {
        args = JSON.parse(toolCall.function.arguments ?? "{}");
      } catch {
        args = {};
      }
      const query = String(args?.query ?? "").trim();
      let articles: Array<{
        id: string;
        title: string;
        summary: string | null;
        category: string | null;
        similarity: number;
      }> = [];
      let aiAnswer = "";

      if (query) {
        try {
          const kbResp = await fetch(`${SUPABASE_URL}/functions/v1/kb-search`, {
            method: "POST",
            headers: {
              Authorization: auth,
              apikey: ANON,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query,
              organization_id: body.organization_id,
              surface: "ticket_create",
            }),
          });
          if (kbResp.ok) {
            const kbJson = await kbResp.json();
            articles = (kbJson?.articles ?? [])
              .filter((a: any) => !shownIds.has(a.id))
              .slice(0, 3);
            aiAnswer = kbJson?.answer ?? "";
          }
        } catch (e) {
          console.error("kb-search call failed:", e);
        }
      }

      if (articles.length > 0) {
        const intro =
          aiAnswer && aiAnswer.length > 0
            ? aiAnswer
            : "I found a few articles that might already cover this — take a quick look. If none of them fit, just tell me and I'll keep going.";
        return json({
          status: "kb_suggestions",
          message: intro,
          articles,
          search_query: query,
        });
      }

      // No matches — push the conversation forward by asking the model to continue without tools.
      const followup = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            ...body.messages,
            {
              role: "system",
              content:
                "Knowledgebase search returned no useful matches. Do NOT mention the search. Continue the intake by asking the next clarifying question, or call finalize_ticket if you already have enough info.",
            },
          ],
          tools: [{ type: "function", function: finalizeTool }],
        }),
      });
      if (followup.ok) {
        const fjson = await followup.json();
        const fchoice = fjson?.choices?.[0]?.message;
        const fcall = fchoice?.tool_calls?.[0];
        if (fcall?.function?.name === finalizeTool.name) {
          try {
            const parsed = JSON.parse(fcall.function.arguments ?? "{}");
            if (parsed?.ready) return json({ status: "draft_ready", draft: parsed });
          } catch { /* ignore */ }
        }
        const reply: string =
          fchoice?.content?.trim?.() ||
          "Could you tell me a bit more so I can capture this properly?";
        return json({ status: "needs_info", message: reply });
      }
      return json({
        status: "needs_info",
        message: "Could you tell me a bit more about what's happening?",
      });
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

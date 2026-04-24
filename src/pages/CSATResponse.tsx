import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SurveyConfig {
  intro_text: string;
  rating_scale: number;
  rating_label: string;
  comment_label: string;
  follow_up_label: string | null;
  thank_you_message: string;
}

export default function CSATResponse() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [ticketRef, setTicketRef] = useState<string>("");
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [hasFollowUp, setHasFollowUp] = useState(false);

  useEffect(() => {
    (async () => {
      if (!token) {
        setError("Invalid survey link.");
        setLoading(false);
        return;
      }
      const { data: resp, error: respErr } = await supabase
        .from("csat_responses")
        .select("id, organization_id, ticket_id, responded_at, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (respErr || !resp) {
        setError("This survey link is invalid or has expired.");
        setLoading(false);
        return;
      }
      if (resp.responded_at) {
        setSubmitted(true);
        setLoading(false);
        return;
      }
      if (resp.expires_at && new Date(resp.expires_at) < new Date()) {
        setError("This survey link has expired.");
        setLoading(false);
        return;
      }
      setResponseId(resp.id);

      const [{ data: survey }, { data: ticket }] = await Promise.all([
        supabase
          .from("csat_surveys")
          .select("intro_text, rating_scale, rating_label, comment_label, follow_up_label, thank_you_message")
          .eq("organization_id", resp.organization_id)
          .maybeSingle(),
        supabase
          .from("helpdesk_tickets")
          .select("reference_number, subject")
          .eq("id", resp.ticket_id)
          .maybeSingle(),
      ]);

      if (survey) {
        setConfig(survey);
        setHasFollowUp(!!survey.follow_up_label);
      } else {
        setConfig({
          intro_text: "How was your support experience?",
          rating_scale: 5,
          rating_label: "How satisfied were you?",
          comment_label: "Additional comments (optional)",
          follow_up_label: null,
          thank_you_message: "Thank you for your feedback!",
        });
      }
      if (ticket) setTicketRef(ticket.reference_number || ticket.subject || "");
      setLoading(false);
    })();
  }, [token]);

  const submit = async () => {
    if (!responseId || !rating) {
      toast.error("Please select a rating");
      return;
    }
    const { error: updErr } = await supabase
      .from("csat_responses")
      .update({
        rating,
        comment: comment.trim() || null,
        follow_up_answer: followUp.trim() || null,
        responded_at: new Date().toISOString(),
      })
      .eq("id", responseId);
    if (updErr) {
      toast.error("Could not submit: " + updErr.message);
      return;
    }
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <p className="text-muted-foreground">Loading survey...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <p className="font-medium">{config?.thank_you_message ?? "Thank you for your feedback!"}</p>
            <p className="text-sm text-muted-foreground">You can close this window.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scale = config?.rating_scale ?? 5;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Satisfaction survey</CardTitle>
          {ticketRef && (
            <p className="text-sm text-muted-foreground">Ticket: {ticketRef}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm">{config?.intro_text}</p>

          <div className="space-y-3">
            <Label>{config?.rating_label}</Label>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: scale }).map((_, i) => {
                const value = i + 1;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={cn(
                      "p-2 rounded-md transition-colors",
                      rating >= value ? "text-warning" : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                  >
                    <Star className={cn("h-8 w-8", rating >= value && "fill-warning")} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{config?.comment_label}</Label>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your thoughts..."
            />
          </div>

          {hasFollowUp && config?.follow_up_label && (
            <div className="space-y-2">
              <Label>{config.follow_up_label}</Label>
              <Textarea
                rows={2}
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </div>
          )}

          <Button onClick={submit} className="w-full" disabled={!rating}>
            Submit feedback
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

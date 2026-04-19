import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  lessonId: string;
  organizationId: string | null;
}

interface Tag {
  id: string;
  tag_name: string;
  color: string | null;
}

interface Assignment {
  id: string;
  tag_id: string;
}

export function LessonTagsPanel({ lessonId, organizationId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [newTagInput, setNewTagInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { data: allTags = [] } = useQuery({
    queryKey: ["lesson-tags", organizationId],
    queryFn: async () => {
      let q = supabase.from("lesson_tags").select("*").order("tag_name");
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["lesson-tag-assignments", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_tag_assignments")
        .select("id, tag_id")
        .eq("lesson_id", lessonId);
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
    enabled: !!lessonId,
  });

  const assignedTagIds = new Set(assignments.map((a) => a.tag_id));
  const assignedTags = allTags.filter((t) => assignedTagIds.has(t.id));

  const assignTag = useMutation({
    mutationFn: async (tagName: string) => {
      const trimmed = tagName.trim();
      if (!trimmed) return;
      let tagId: string;
      const existing = allTags.find((t) => t.tag_name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        tagId = existing.id;
      } else {
        const { data, error } = await supabase
          .from("lesson_tags")
          .insert({
            tag_name: trimmed,
            organization_id: organizationId,
            created_by: user?.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        tagId = data.id;
      }
      if (!assignedTagIds.has(tagId)) {
        const { error } = await supabase.from("lesson_tag_assignments").insert({
          lesson_id: lessonId,
          tag_id: tagId,
          assigned_by: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lesson-tag-assignments", lessonId] });
      qc.invalidateQueries({ queryKey: ["lesson-tags", organizationId] });
      setNewTagInput("");
      setShowSuggestions(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassignTag = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("lesson_tag_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lesson-tag-assignments", lessonId] }),
  });

  const filteredSuggestions = newTagInput
    ? allTags.filter(
        (t) =>
          !assignedTagIds.has(t.id) &&
          t.tag_name.toLowerCase().includes(newTagInput.toLowerCase()),
      )
    : allTags.filter((t) => !assignedTagIds.has(t.id)).slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {assignedTags.map((t) => {
          const a = assignments.find((x) => x.tag_id === t.id);
          return (
            <Badge
              key={t.id}
              style={t.color ? { backgroundColor: `${t.color}20`, color: t.color, borderColor: `${t.color}50` } : undefined}
              className="text-xs gap-1 cursor-pointer"
            >
              {t.tag_name}
              {a && (
                <button
                  onClick={() => unassignTag.mutate(a.id)}
                  className="ml-0.5 hover:opacity-75"
                  aria-label="Remove tag"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          );
        })}
        {assignedTags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No tags</span>
        )}
      </div>

      <div className="relative">
        <div className="flex gap-1">
          <Input
            value={newTagInput}
            placeholder="Add tag..."
            onChange={(e) => {
              setNewTagInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTagInput.trim()) {
                e.preventDefault();
                assignTag.mutate(newTagInput);
              }
            }}
            className="h-8 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!newTagInput.trim()}
            onClick={() => assignTag.mutate(newTagInput)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
            {filteredSuggestions.map((t) => (
              <button
                key={t.id}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => assignTag.mutate(t.tag_name)}
              >
                {t.tag_name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

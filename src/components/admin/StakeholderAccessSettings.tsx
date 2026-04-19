import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useOrgAccessLevel } from "@/hooks/useOrgAccessLevel";
import { toast } from "sonner";
import { Plus, Trash2, Eye, ShieldAlert } from "lucide-react";

type Access = {
  id: string;
  user_id: string;
  scope_type: "programme" | "project" | "organization";
  scope_id: string;
  expires_at: string | null;
  created_at: string;
};

type EntityOption = { id: string; name: string };
type ProfileLite = { user_id: string; full_name: string | null; email: string };

export default function StakeholderAccessSettings() {
  const { currentOrganization } = useOrganization();
  const { accessLevel, loading: accessLoading } = useOrgAccessLevel();
  const isAdmin = accessLevel === "admin";

  const [accesses, setAccesses] = useState<Access[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [programmes, setProgrammes] = useState<EntityOption[]>([]);
  const [projects, setProjects] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchEmail, setSearchEmail] = useState("");
  const [foundUser, setFoundUser] = useState<ProfileLite | null>(null);
  const [scopeType, setScopeType] = useState<"programme" | "project">("programme");
  const [scopeId, setScopeId] = useState("");

  const fetchAll = async () => {
    if (!currentOrganization) return;
    setLoading(true);
    const [accessRes, progRes, projRes] = await Promise.all([
      supabase
        .from("stakeholder_portal_access")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("created_at", { ascending: false }),
      supabase.from("programmes").select("id, name").eq("organization_id", currentOrganization.id),
      supabase.from("projects").select("id, name").eq("organization_id", currentOrganization.id),
    ]);

    const acc = (accessRes.data || []) as Access[];
    setAccesses(acc);
    setProgrammes(progRes.data || []);
    setProjects(projRes.data || []);

    const userIds = Array.from(new Set(acc.map((a) => a.user_id)));
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const map: Record<string, ProfileLite> = {};
      (profs || []).forEach((p: ProfileLite) => (map[p.user_id] = p));
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganization?.id]);

  const lookupUser = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .eq("email", searchEmail.trim().toLowerCase())
      .maybeSingle();
    setSearching(false);
    if (!data) {
      toast.error("No user with that email. Ask them to sign up first.");
      setFoundUser(null);
      return;
    }
    setFoundUser(data as ProfileLite);
  };

  const grantAccess = async () => {
    if (!foundUser || !currentOrganization || !scopeId) {
      toast.error("Pick a user and a scope");
      return;
    }
    const { error } = await supabase.from("stakeholder_portal_access").insert({
      organization_id: currentOrganization.id,
      user_id: foundUser.user_id,
      scope_type: scopeType,
      scope_id: scopeId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stakeholder access granted");
    setCreateOpen(false);
    setSearchEmail("");
    setFoundUser(null);
    setScopeId("");
    fetchAll();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("stakeholder_portal_access").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Access revoked");
    fetchAll();
  };

  const scopeName = (a: Access) => {
    if (a.scope_type === "programme") return programmes.find((p) => p.id === a.scope_id)?.name || "Unknown";
    if (a.scope_type === "project") return projects.find((p) => p.id === a.scope_id)?.name || "Unknown";
    return "Organization";
  };

  if (accessLoading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShieldAlert className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium">Org admins only</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only organization admins can manage stakeholder portal access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="h-5 w-5" /> Stakeholder Portal Access
          </h2>
          <p className="text-sm text-muted-foreground">
            Grant external stakeholders read-only access to specific programmes or projects via their account.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Grant access
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Grant stakeholder access</DialogTitle>
              <DialogDescription>
                Stakeholder must already have a Lovable account. They'll see the Stakeholder Portal in their navigation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stakeholder email</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="stakeholder@example.com"
                  />
                  <Button onClick={lookupUser} disabled={searching || !searchEmail.trim()}>
                    {searching ? "Looking…" : "Lookup"}
                  </Button>
                </div>
                {foundUser && (
                  <div className="text-sm text-success bg-success/10 p-2 rounded">
                    Found: {foundUser.full_name || foundUser.email}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Scope type</Label>
                  <Select value={scopeType} onValueChange={(v) => { setScopeType(v as "programme" | "project"); setScopeId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="programme">Programme</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{scopeType === "programme" ? "Programme" : "Project"}</Label>
                  <Select value={scopeId} onValueChange={setScopeId}>
                    <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                    <SelectContent>
                      {(scopeType === "programme" ? programmes : projects).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={grantAccess} disabled={!foundUser || !scopeId}>Grant access</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : accesses.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No stakeholder access granted yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stakeholder</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accesses.map((a) => {
                  const p = profiles[a.user_id];
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <p className="font-medium">{p?.full_name || p?.email || a.user_id}</p>
                        {p?.email && p?.full_name && (
                          <p className="text-xs text-muted-foreground">{p.email}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.scope_type}</Badge>
                        <span className="ml-2 text-sm">{scopeName(a)}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => revoke(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

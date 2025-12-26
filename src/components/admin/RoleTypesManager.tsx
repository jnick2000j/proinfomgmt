import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_system: boolean;
  can_manage_programmes: boolean;
  can_manage_projects: boolean;
  can_manage_products: boolean;
  can_manage_users: boolean;
  can_view_reports: boolean;
}

interface CreateRoleDialogProps {
  role?: CustomRole;
  onSuccess: () => void;
}

export function CreateRoleDialog({ role, onSuccess }: CreateRoleDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [color, setColor] = useState(role?.color || "#6b7280");
  const [canManageProgrammes, setCanManageProgrammes] = useState(role?.can_manage_programmes || false);
  const [canManageProjects, setCanManageProjects] = useState(role?.can_manage_projects || false);
  const [canManageProducts, setCanManageProducts] = useState(role?.can_manage_products || false);
  const [canManageUsers, setCanManageUsers] = useState(role?.can_manage_users || false);
  const [canViewReports, setCanViewReports] = useState(role?.can_view_reports ?? true);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (role) {
        const { error } = await supabase
          .from("custom_roles")
          .update({
            name,
            description,
            color,
            can_manage_programmes: canManageProgrammes,
            can_manage_projects: canManageProjects,
            can_manage_products: canManageProducts,
            can_manage_users: canManageUsers,
            can_view_reports: canViewReports,
          })
          .eq("id", role.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("custom_roles")
          .insert({
            name,
            description,
            color,
            can_manage_programmes: canManageProgrammes,
            can_manage_projects: canManageProjects,
            can_manage_products: canManageProducts,
            can_manage_users: canManageUsers,
            can_view_reports: canViewReports,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success(role ? "Role updated" : "Role created");
      setOpen(false);
      onSuccess();
      if (!role) {
        setName("");
        setDescription("");
        setColor("#6b7280");
        setCanManageProgrammes(false);
        setCanManageProjects(false);
        setCanManageProducts(false);
        setCanManageUsers(false);
        setCanViewReports(true);
      }
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {role ? (
          <Button variant="ghost" size="icon" disabled={role.is_system}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role ? "Edit Role" : "Create Role"}</DialogTitle>
          <DialogDescription>
            {role ? "Update role permissions and details." : "Create a new role with specific permissions."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 space-y-2">
              <Label>Role Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Product Manager"
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 p-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this role can do..."
              rows={2}
            />
          </div>
          <div className="space-y-3">
            <Label className="text-base">Permissions</Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Manage Programmes</p>
                  <p className="text-xs text-muted-foreground">Create, edit, and delete programmes</p>
                </div>
                <Switch checked={canManageProgrammes} onCheckedChange={setCanManageProgrammes} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Manage Projects</p>
                  <p className="text-xs text-muted-foreground">Create, edit, and delete projects</p>
                </div>
                <Switch checked={canManageProjects} onCheckedChange={setCanManageProjects} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Manage Products</p>
                  <p className="text-xs text-muted-foreground">Create, edit, and delete products</p>
                </div>
                <Switch checked={canManageProducts} onCheckedChange={setCanManageProducts} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Manage Users</p>
                  <p className="text-xs text-muted-foreground">Create users and assign roles</p>
                </div>
                <Switch checked={canManageUsers} onCheckedChange={setCanManageUsers} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">View Reports</p>
                  <p className="text-xs text-muted-foreground">Access reports and analytics</p>
                </div>
                <Switch checked={canViewReports} onCheckedChange={setCanViewReports} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name}>
            {mutation.isPending ? "Saving..." : role ? "Update Role" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RoleTypesManagerProps {
  onRolesChange?: () => void;
}

export function RoleTypesManager({ onRolesChange }: RoleTypesManagerProps) {
  const queryClient = useQueryClient();

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["custom-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_roles")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as CustomRole[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from("custom_roles")
        .delete()
        .eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-roles"] });
      toast.success("Role deleted");
      onRolesChange?.();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading roles...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Role Types</h3>
          <p className="text-sm text-muted-foreground">
            Define role types with specific permissions for access control (RBAC)
          </p>
        </div>
        <CreateRoleDialog onSuccess={() => onRolesChange?.()} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => (
          <div
            key={role.id}
            className="metric-card flex flex-col"
            style={{ borderLeftColor: role.color || "#6b7280", borderLeftWidth: "4px" }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{role.name}</h4>
                  {role.is_system && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">System</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{role.description || "No description"}</p>
              </div>
              <div className="flex gap-1">
                <CreateRoleDialog role={role} onSuccess={() => onRolesChange?.()} />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={role.is_system}
                  onClick={() => deleteMutation.mutate(role.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-auto">
              {role.can_manage_programmes && (
                <span className="text-xs bg-success/10 text-success px-2 py-1 rounded">Programmes</span>
              )}
              {role.can_manage_projects && (
                <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded">Projects</span>
              )}
              {role.can_manage_products && (
                <span className="text-xs bg-info/10 text-info px-2 py-1 rounded">Products</span>
              )}
              {role.can_manage_users && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Users</span>
              )}
              {role.can_view_reports && (
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">Reports</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  ArrowRight,
  Link2,
  Unlink,
  AlertTriangle,
  ChevronRight,
  Search,
  Filter,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FeatureDetailDialog } from "@/components/dialogs/FeatureDetailDialog";

interface Feature {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  moscow: string | null;
  product_id: string;
  target_release: string | null;
  reach_score: number | null;
  impact_score: number | null;
  confidence_score: number | null;
  effort_score: number | null;
  story_points?: number | null;
  sprint_id?: string | null;
}

interface Dependency {
  id: string;
  feature_id: string;
  depends_on_id: string;
  dependency_type: string;
  description: string | null;
  created_by: string | null;
}

interface Product {
  id: string;
  name: string;
}

const dependencyTypes = [
  { value: "blocks", label: "Blocks", color: "bg-destructive/10 text-destructive" },
  { value: "requires", label: "Requires", color: "bg-warning/10 text-warning" },
  { value: "related", label: "Related", color: "bg-info/10 text-info" },
];

const statusColors: Record<string, string> = {
  backlog: "bg-muted text-muted-foreground",
  planned: "bg-info/10 text-info",
  in_progress: "bg-warning/10 text-warning",
  review: "bg-primary/10 text-primary",
  done: "bg-success/10 text-success",
};

export default function FeatureDependencies() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [featureDialogOpen, setFeatureDialogOpen] = useState(false);
  const { user } = useAuth();

  const [newDependency, setNewDependency] = useState({
    feature_id: "",
    depends_on_id: "",
    dependency_type: "blocks",
    description: "",
  });

  const fetchData = async () => {
    setLoading(true);

    const [featuresRes, dependenciesRes, productsRes] = await Promise.all([
      supabase.from("product_features").select("*").order("name"),
      supabase.from("feature_dependencies").select("*"),
      supabase.from("products").select("id, name").order("name"),
    ]);

    if (featuresRes.error) console.error("Features error:", featuresRes.error);
    if (dependenciesRes.error) console.error("Dependencies error:", dependenciesRes.error);
    if (productsRes.error) console.error("Products error:", productsRes.error);

    setFeatures(featuresRes.data || []);
    setDependencies(dependenciesRes.data || []);
    setProducts(productsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateDependency = async () => {
    if (!newDependency.feature_id || !newDependency.depends_on_id) {
      toast.error("Please select both features");
      return;
    }

    if (newDependency.feature_id === newDependency.depends_on_id) {
      toast.error("A feature cannot depend on itself");
      return;
    }

    // Check for existing dependency
    const existing = dependencies.find(
      d => d.feature_id === newDependency.feature_id && d.depends_on_id === newDependency.depends_on_id
    );
    if (existing) {
      toast.error("This dependency already exists");
      return;
    }

    const { error } = await supabase.from("feature_dependencies").insert({
      feature_id: newDependency.feature_id,
      depends_on_id: newDependency.depends_on_id,
      dependency_type: newDependency.dependency_type,
      description: newDependency.description || null,
      created_by: user?.id,
    });

    if (error) {
      toast.error("Failed to create dependency");
      console.error(error);
    } else {
      toast.success("Dependency created");
      setIsCreateOpen(false);
      setNewDependency({
        feature_id: "",
        depends_on_id: "",
        dependency_type: "blocks",
        description: "",
      });
      fetchData();
    }
  };

  const handleDeleteDependency = async (id: string) => {
    const { error } = await supabase.from("feature_dependencies").delete().eq("id", id);

    if (error) {
      toast.error("Failed to remove dependency");
    } else {
      toast.success("Dependency removed");
      setDependencies(prev => prev.filter(d => d.id !== id));
    }
  };

  const getFeatureById = (id: string) => features.find(f => f.id === id);
  const getProductName = (productId: string) => products.find(p => p.id === productId)?.name || "Unknown";

  const getDependenciesForFeature = (featureId: string) => {
    return dependencies.filter(d => d.feature_id === featureId);
  };

  const getDependentsOfFeature = (featureId: string) => {
    return dependencies.filter(d => d.depends_on_id === featureId);
  };

  const getBlockedFeatures = () => {
    return features.filter(f => {
      const deps = getDependenciesForFeature(f.id);
      return deps.some(d => {
        const blockedBy = getFeatureById(d.depends_on_id);
        return d.dependency_type === "blocks" && blockedBy && blockedBy.status !== "done";
      });
    });
  };

  const filteredFeatures = features.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesProduct = productFilter === "all" || f.product_id === productFilter;
    const hasDependencies = getDependenciesForFeature(f.id).length > 0 || getDependentsOfFeature(f.id).length > 0;
    return matchesSearch && matchesProduct && (searchQuery || productFilter !== "all" || hasDependencies);
  });

  const blockedFeatures = getBlockedFeatures();

  return (
    <AppLayout title="Feature Dependencies" subtitle="Visualize and manage relationships between features">
      <div className="space-y-6">
        {/* Blocked Features Alert */}
        {blockedFeatures.length > 0 && (
          <div className="p-4 rounded-lg border-2 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold text-destructive">Blocked Features ({blockedFeatures.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {blockedFeatures.map(f => (
                <Badge
                  key={f.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-destructive/10"
                  onClick={() => {
                    setSelectedFeature(f);
                    setFeatureDialogOpen(true);
                  }}
                >
                  {f.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex gap-4 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search features..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Dependency
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Feature Dependency</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Feature</Label>
                  <Select
                    value={newDependency.feature_id}
                    onValueChange={(v) => setNewDependency({ ...newDependency, feature_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select feature" />
                    </SelectTrigger>
                    <SelectContent>
                      {features.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-center gap-2 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <Select
                    value={newDependency.dependency_type}
                    onValueChange={(v) => setNewDependency({ ...newDependency, dependency_type: v })}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dependencyTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="space-y-2">
                  <Label>Depends On</Label>
                  <Select
                    value={newDependency.depends_on_id}
                    onValueChange={(v) => setNewDependency({ ...newDependency, depends_on_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select feature" />
                    </SelectTrigger>
                    <SelectContent>
                      {features
                        .filter(f => f.id !== newDependency.feature_id)
                        .map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Description (Optional)</Label>
                  <Textarea
                    value={newDependency.description}
                    onChange={(e) => setNewDependency({ ...newDependency, description: e.target.value })}
                    placeholder="Describe the dependency relationship"
                  />
                </div>

                <Button onClick={handleCreateDependency} className="w-full">
                  <Link2 className="h-4 w-4 mr-2" />
                  Create Dependency
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Dependencies List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading dependencies...</div>
        ) : filteredFeatures.length === 0 ? (
          <div className="metric-card text-center py-12">
            <Link2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No dependencies found</p>
            <p className="text-sm text-muted-foreground">Create a dependency to track feature relationships</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFeatures.map(feature => {
              const deps = getDependenciesForFeature(feature.id);
              const dependents = getDependentsOfFeature(feature.id);
              const statusConf = statusColors[feature.status] || statusColors.backlog;

              if (deps.length === 0 && dependents.length === 0) return null;

              return (
                <div key={feature.id} className="metric-card">
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        setSelectedFeature(feature);
                        setFeatureDialogOpen(true);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{feature.name}</h4>
                        <Badge className={statusConf}>{feature.status.replace("_", " ")}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">{getProductName(feature.product_id)}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Dependencies (this feature depends on) */}
                    {deps.length > 0 && (
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <ArrowRight className="h-4 w-4" />
                          Depends On ({deps.length})
                        </h5>
                        {deps.map(dep => {
                          const depFeature = getFeatureById(dep.depends_on_id);
                          const typeConf = dependencyTypes.find(t => t.value === dep.dependency_type) || dependencyTypes[0];
                          const isBlocked = dep.dependency_type === "blocks" && depFeature?.status !== "done";

                          return (
                            <div
                              key={dep.id}
                              className={`p-3 rounded-lg border flex items-center justify-between ${isBlocked ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Badge className={typeConf.color}>{typeConf.label}</Badge>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="font-medium text-sm truncate cursor-pointer hover:underline"
                                    onClick={() => {
                                      if (depFeature) {
                                        setSelectedFeature(depFeature);
                                        setFeatureDialogOpen(true);
                                      }
                                    }}
                                  >
                                    {depFeature?.name || "Unknown"}
                                  </p>
                                  {dep.description && (
                                    <p className="text-xs text-muted-foreground truncate">{dep.description}</p>
                                  )}
                                </div>
                                {depFeature && (
                                  <Badge variant="outline" className={statusColors[depFeature.status]}>
                                    {depFeature.status.replace("_", " ")}
                                  </Badge>
                                )}
                                {isBlocked && (
                                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-2 flex-shrink-0"
                                onClick={() => handleDeleteDependency(dep.id)}
                              >
                                <Unlink className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Dependents (features that depend on this) */}
                    {dependents.length > 0 && (
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <ArrowRight className="h-4 w-4 rotate-180" />
                          Blocking ({dependents.length})
                        </h5>
                        {dependents.map(dep => {
                          const depFeature = getFeatureById(dep.feature_id);
                          const typeConf = dependencyTypes.find(t => t.value === dep.dependency_type) || dependencyTypes[0];

                          return (
                            <div
                              key={dep.id}
                              className="p-3 rounded-lg border border-border flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Badge className={typeConf.color}>{typeConf.label}</Badge>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className="font-medium text-sm truncate cursor-pointer hover:underline"
                                    onClick={() => {
                                      if (depFeature) {
                                        setSelectedFeature(depFeature);
                                        setFeatureDialogOpen(true);
                                      }
                                    }}
                                  >
                                    {depFeature?.name || "Unknown"}
                                  </p>
                                </div>
                                {depFeature && (
                                  <Badge variant="outline" className={statusColors[depFeature.status]}>
                                    {depFeature.status.replace("_", " ")}
                                  </Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-2 flex-shrink-0"
                                onClick={() => handleDeleteDependency(dep.id)}
                              >
                                <Unlink className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FeatureDetailDialog
        feature={selectedFeature}
        open={featureDialogOpen}
        onOpenChange={setFeatureDialogOpen}
        onUpdate={fetchData}
        products={products}
      />
    </AppLayout>
  );
}

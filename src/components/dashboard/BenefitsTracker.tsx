import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function BenefitsTracker() {
  const { data: benefits = [], isLoading } = useQuery({
    queryKey: ["benefits-tracker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benefits")
        .select("id, category, target_value, current_value, realization");
      if (error) throw error;
      return data;
    },
  });

  // Group benefits by category
  const benefitsByCategory = benefits.reduce((acc, benefit) => {
    const category = benefit.category || "Other";
    if (!acc[category]) {
      acc[category] = { planned: 0, realized: 0 };
    }
    acc[category].planned += parseInt(benefit.target_value || "0") || 0;
    acc[category].realized += parseInt(benefit.current_value || "0") || 0;
    return acc;
  }, {} as Record<string, { planned: number; realized: number }>);

  const benefitsData = Object.entries(benefitsByCategory).map(([name, values]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    planned: values.planned,
    realized: values.realized,
  }));

  if (isLoading) {
    return (
      <div className="metric-card animate-slide-up" style={{ animationDelay: "0.3s" }}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Benefits Realization</h3>
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (benefits.length === 0) {
    return (
      <div className="metric-card animate-slide-up" style={{ animationDelay: "0.3s" }}>
        <h3 className="text-lg font-semibold text-foreground mb-4">Benefits Realization</h3>
        <div className="text-center py-8 text-muted-foreground">
          No benefits tracked yet. Add benefits in the Benefits Register.
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card animate-slide-up" style={{ animationDelay: "0.3s" }}>
      <h3 className="text-lg font-semibold text-foreground mb-4">Benefits Realization</h3>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={benefitsData} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <YAxis 
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={{ stroke: "hsl(var(--border))" }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: "hsl(var(--card))", 
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend 
              formatter={(value) => <span className="text-sm text-foreground capitalize">{value}</span>}
            />
            <Bar dataKey="planned" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="realized" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

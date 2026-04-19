import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { QuickActionTabs } from "@/components/QuickActionTabs";
import { ListTodo, Calendar, Layers } from "lucide-react";
import TaskManagement from "./TaskManagement";
import SprintPlanning from "./SprintPlanning";
import UnifiedBacklog from "./UnifiedBacklog";

const TASK_TABS = [
  { value: "tasks", label: "Task Management", icon: ListTodo },
  { value: "sprints", label: "Sprint Planning", icon: Calendar },
  { value: "backlog", label: "Unified Backlog", icon: Layers },
];

export default function Tasks() {
  return (
    <AppLayout title="Tasks" subtitle="Task management, sprint planning, and unified backlog">
      <Tabs defaultValue="tasks" className="space-y-6">
        <QuickActionTabs
          items={TASK_TABS}
          className="grid-cols-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3"
        />

        <TabsContent value="tasks">
          <TaskManagement embedded />
        </TabsContent>
        <TabsContent value="sprints">
          <SprintPlanning embedded />
        </TabsContent>
        <TabsContent value="backlog">
          <UnifiedBacklog embedded />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

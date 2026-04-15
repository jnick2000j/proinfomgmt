import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Bug,
  Target,
  Users,
  FileText,
  Wrench,
  BookOpen,
} from "lucide-react";
import RiskRegister from "./RiskRegister";
import IssueRegister from "./IssueRegister";
import BenefitsRegister from "./BenefitsRegister";
import StakeholderRegister from "./StakeholderRegister";
import BusinessRequirements from "./BusinessRequirements";
import TechnicalRequirements from "./TechnicalRequirements";
import LessonsLearned from "./LessonsLearned";

export default function Registers() {
  return (
    <AppLayout title="Registers" subtitle="PRINCE2 MSP registers and requirements management">
      <Tabs defaultValue="risks" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="risks" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Risks
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <Bug className="h-4 w-4" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="benefits" className="gap-2">
            <Target className="h-4 w-4" />
            Benefits
          </TabsTrigger>
          <TabsTrigger value="stakeholders" className="gap-2">
            <Users className="h-4 w-4" />
            Stakeholders
          </TabsTrigger>
          <TabsTrigger value="business-req" className="gap-2">
            <FileText className="h-4 w-4" />
            Business Req.
          </TabsTrigger>
          <TabsTrigger value="technical-req" className="gap-2">
            <Wrench className="h-4 w-4" />
            Technical Req.
          </TabsTrigger>
          <TabsTrigger value="lessons" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Lessons
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risks">
          <RiskRegister embedded />
        </TabsContent>
        <TabsContent value="issues">
          <IssueRegister embedded />
        </TabsContent>
        <TabsContent value="benefits">
          <BenefitsRegister embedded />
        </TabsContent>
        <TabsContent value="stakeholders">
          <StakeholderRegister embedded />
        </TabsContent>
        <TabsContent value="business-req">
          <BusinessRequirements embedded />
        </TabsContent>
        <TabsContent value="technical-req">
          <TechnicalRequirements embedded />
        </TabsContent>
        <TabsContent value="lessons">
          <LessonsLearned embedded />
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}

// components/flowSidebarComponent/components/ProjectFlowsGroup.tsx
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { FlowType } from "@/types/flow";
import { cn } from "@/utils/utils";

interface ProjectFlowsGroupProps {
  flows: FlowType[];
  folderId: string;
  currentFlowId?: string;
  /** Called when the user wants to create a new flow inside this project */
  onAddFlow?: () => void;
}

export const ProjectFlowsGroup = memo(function ProjectFlowsGroup({
  flows,
  folderId,
  currentFlowId,
  onAddFlow,
}: ProjectFlowsGroupProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true); // expanded by default

  return (
    <SidebarGroup className="p-3 pr-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarGroupLabel className="cursor-default flex items-center justify-between w-full px-0">
          {/* Left: toggle trigger */}
          <CollapsibleTrigger asChild>
            <button
              className="flex items-center gap-1 flex-1 text-left hover:text-foreground transition-colors"
              aria-label={
                isOpen ? t("sidebar.collapseFlows") : t("sidebar.expandFlows")
              }
            >
              <ForwardedIconComponent
                name="ChevronRight"
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                  isOpen && "rotate-90",
                )}
              />
              <span>{t("sidebar.projectFlows", "All Flows")}</span>
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({flows.length})
              </span>
            </button>
          </CollapsibleTrigger>

          {/* Right: add flow button */}
          {onAddFlow && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground hover:text-foreground shrink-0"
              onClick={onAddFlow}
              aria-label={t("sidebar.addFlow", "Add flow")}
            >
              <ForwardedIconComponent name="Plus" className="h-3.5 w-3.5" />
            </Button>
          )}
        </SidebarGroupLabel>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {flows.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("sidebar.noFlows", "No flows in this project")}
                </li>
              ) : (
                flows.map((flow) => {
                  const isActive = flow.id === currentFlowId;
                  return (
                    <SidebarMenuItem key={flow.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() =>
                          navigate(`/folder/${folderId}/flow/${flow.id}`)
                        }
                        className={cn(
                          "flex items-center gap-2 w-full h-8 px-2 rounded-md text-sm",
                          "hover:bg-accent hover:text-accent-foreground transition-colors",
                          isActive &&
                            "bg-accent text-accent-foreground font-medium",
                        )}
                        title={flow.name}
                      >
                        <ForwardedIconComponent
                          name="Workflow"
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isActive
                              ? "text-accent-foreground"
                              : "text-muted-foreground",
                          )}
                        />
                        <span className="truncate flex-1">{flow.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
});

ProjectFlowsGroup.displayName = "ProjectFlowsGroup";

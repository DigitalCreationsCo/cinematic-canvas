// components/flowSidebarComponent/components/ProjectFlowsGroup.tsx
import { memo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { usePostCreateSnapshot } from "@/controllers/API/queries/flow-version";
import useSaveFlow from "@/hooks/flows/use-save-flow";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
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
  const hasUnsavedChanges = useUnsavedChanges();
  const saveFlow = useSaveFlow();
  const { mutate: createSnapshot, isPending: isCreatingSnapshot } =
    usePostCreateSnapshot();

  // ── Confirmation dialog state ──────────────────────────────────────────
  const [pendingTarget, setPendingTarget] = useState<{
    folderId: string;
    flowId: string;
  } | null>(null);
  const [saveAsVersion, setSaveAsVersion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const showConfirm = pendingTarget !== null;

  const navigateTo = useCallback(
    (target: { folderId: string; flowId: string }) => {
      navigate(`/folder/${target.folderId}/flow/${target.flowId}`);
    },
    [navigate],
  );

  const handleDontSave = useCallback(() => {
    if (pendingTarget) {
      navigateTo(pendingTarget);
      setPendingTarget(null);
    }
  }, [pendingTarget, navigateTo]);

  const handleSave = useCallback(() => {
    if (!pendingTarget) return;

    if (saveAsVersion) {
      // Save a new version (snapshot), then navigate
      setIsSaving(true);
      createSnapshot(
        { flowId: currentFlowId!, description: null },
        {
          onSuccess: () => {
            setIsSaving(false);
            navigateTo(pendingTarget);
            setPendingTarget(null);
          },
          onError: () => {
            setIsSaving(false);
          },
        },
      );
    } else {
      // Save the regular way, then navigate
      setIsSaving(true);
      saveFlow().then(() => {
        setIsSaving(false);
        navigateTo(pendingTarget);
        setPendingTarget(null);
      });
    }
  }, [
    pendingTarget,
    saveAsVersion,
    currentFlowId,
    createSnapshot,
    saveFlow,
    navigateTo,
  ]);

  const handleCancel = useCallback(() => {
    setPendingTarget(null);
  }, []);

  // ── Flow click handler ─────────────────────────────────────────────────
  const handleFlowClick = useCallback(
    (target: { folderId: string; flowId: string }) => {
      if (hasUnsavedChanges && target.flowId !== currentFlowId) {
        setPendingTarget(target);
        setSaveAsVersion(false);
        setIsSaving(false);
      } else {
        navigateTo(target);
      }
    },
    [hasUnsavedChanges, currentFlowId, navigateTo],
  );

  return (
    <>
      <SidebarGroup className="p-3 pr-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <SidebarGroupLabel className="flex w-full cursor-default items-center justify-between px-0">
            {/* Left: toggle trigger */}
            <CollapsibleTrigger asChild>
              <button
                className="flex flex-1 items-center gap-1 text-left transition-colors hover:text-foreground"
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
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({flows.length})
                </span>
              </button>
            </CollapsibleTrigger>

            {/* Right: add flow button */}
            {onAddFlow && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
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
                            handleFlowClick({
                              folderId,
                              flowId: flow.id,
                            })
                          }
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm",
                            "transition-colors hover:bg-accent hover:text-accent-foreground",
                            isActive &&
                              "bg-accent font-medium text-accent-foreground",
                          )}
                          title={flow.name}
                        >
                          <ForwardedIconComponent
                            name={flow.icon || "Workflow"}
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isActive
                                ? "text-accent-foreground"
                                : "text-muted-foreground",
                            )}
                          />
                          <span className="flex-1 truncate">{flow.name}</span>
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

      {/* ── Confirmation dialog ──────────────────────────────────────── */}
      {showConfirm &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 flex w-full max-w-md flex-col gap-4 rounded-xl border bg-background p-6 shadow-lg">
              <div className="flex items-center gap-2">
                <ForwardedIconComponent
                  name="Info"
                  className="h-5 w-5 text-primary"
                />
                <span className="text-lg font-semibold">Unsaved Changes</span>
              </div>
              <p className="text-sm text-muted-foreground">
                This flow has unsaved changes. What would you like to do?
              </p>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="save-as-version"
                  checked={saveAsVersion}
                  onCheckedChange={(checked: boolean) =>
                    setSaveAsVersion(checked)
                  }
                />
                <label
                  htmlFor="save-as-version"
                  className="text-sm text-muted-foreground"
                >
                  Save a new version instead
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDontSave}
                  disabled={isSaving || isCreatingSnapshot}
                >
                  Don&apos;t Save
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  loading={isSaving || isCreatingSnapshot}
                >
                  Save
                </Button>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleCancel}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  disabled={isSaving || isCreatingSnapshot}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
});

ProjectFlowsGroup.displayName = "ProjectFlowsGroup";

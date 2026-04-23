import { useState, useEffect, useMemo, memo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '#client/components/ui/dialog.js';
import { Button } from '#client/components/ui/button.js';
import { useProjectStore } from '../store/useProjectStore.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { useCanvasUIStore } from '../store/useCanvasUIStore.js';
import { Alert, AlertDescription, AlertTitle } from '#client/components/ui/alert.js';
import { AlertCircle } from 'lucide-react';
import { Textarea } from '#client/components/ui/textarea.js';
import { resolveIntervention, resumePipeline } from '#client/lib/api.js';
import { useAuth } from '#client/lib/auth-context.js';
import { useWorldStore } from '#client/store/useWorldStore.js';

export function CompoundModal() {
    const interrupt = usePipelineStore((s) => s.interrupt);

    if (!interrupt) return null;

    return interrupt.type === "user_approval_before_video_gen" ?
        <ModalContentUserApprovalAssets interrupt={interrupt} /> :
        interrupt.type === "user_approval_after_storyboard_gen" ?
            <ModalContentUserApprovalStoryboard interrupt={interrupt} /> :
            <ModalContentErrorIntervention interrupt={interrupt} />;
}

const ModalContentErrorIntervention = memo(({ interrupt }: { interrupt: any; }) => {

    const setInterrupt = usePipelineStore((s) => s.setInterrupt);
    const setStatus = usePipelineStore((s) => s.setStatus);
    const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
    const worldId = useWorldStore((s) => s.worldId);

    const setIsLoading = useCanvasUIStore((s) => s.setIsLoading);
    const [paramsJson, setParamsJson] = useState<string>('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    const { activeTeamId: teamId, user } = useAuth();


    useEffect(() => {
        if (interrupt) {
            const params = interrupt.currentParams || interrupt.originalParams;
            setParamsJson(typeof params === 'string' ? params : JSON.stringify(params, null, 2));
        }
    }, [interrupt]);

    const handleResolve = async (action: any, revisedParams?: any) => {
        if (!selectedProjectId) return;

        try {
            await resolveIntervention({
                projectId: selectedProjectId,
                payload: {
                    action,
                    revisedParams,
                    jobType: interrupt.jobType || interrupt.functionName
                }
            });

            setStatus("generating");
            setIsLoading(false);
            setInterrupt(null);
        } catch (error) {
            console.error('Error resolving intervention:', error);
            // Maybe show toast error
        }
    };

    const handleRetryWithChanges = () => {
        try {
            const parsed = JSON.parse(paramsJson);
            handleResolve('retry', parsed);
        } catch (e) {
            setJsonError((e as Error).message);
        }
    };

    return <>
        <Dialog open={!!interrupt} onOpenChange={(open) => !open && handleResolve('abort')}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Human Intervention Required</DialogTitle>
                    <DialogDescription>
                        An error occurred during {interrupt.jobType || interrupt.functionName || 'LLM execution'}.
                        Please review the error and parameters.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription className="font-mono  whitespace-pre-wrap">
                            {interrupt.error}
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                        <label className=" font-medium">Parameters (JSON)</label>
                        <Textarea
                            value={paramsJson}
                            onChange={(e) => {
                                setParamsJson(e.target.value);
                                setJsonError(null);
                            }}
                            className="font-mono  h-[300px]"
                        />
                        {jsonError && (
                            <p className="text-destructive ">{jsonError}</p>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button onClick={() => handleResolve('abort')}>
                        Cancel Operation
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => handleResolve('retry')}>
                            Retry Original
                        </Button>
                        <Button onClick={handleRetryWithChanges}>
                            Retry with Changes
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>;
});

const ModalContentUserApprovalAssets = memo(({ interrupt }: { interrupt: any; }) => {
    const setInterrupt = usePipelineStore((s) => s.setInterrupt);
    const setStatus = usePipelineStore((s) => s.setStatus);
    const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
    const worldId = useWorldStore((s) => s.worldId);
    const { activeTeamId: teamId, user } = useAuth();
    const setIsLoading = useCanvasUIStore((s) => s.setIsLoading);

    const handleResume = async () => {
        if (!selectedProjectId) return;
        try {
            setStatus("generating");
            setIsLoading(false);
            await resumePipeline({
                projectId: selectedProjectId,
                payload: { resumeValue: true }
            });
            setInterrupt(null);
        } catch (error) {
            console.error('Error resuming pipeline:', error);
            setStatus("error");
        }
    };

    const handleDismiss = () => {
        setIsLoading(false);
        setInterrupt(null);
    };

    return (
        <Dialog open={!!interrupt} onOpenChange={(open) => !open && handleDismiss()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-center">Review Project Assets</DialogTitle>
                    <DialogDescription>
                        You can review images, characters, and scenes, and make changes before generating videos.
                    </DialogDescription>
                </DialogHeader>

                <p className=" text-muted-foreground">
                    Once you are satisfied, click Resume Project to begin generating your videos.
                </p>

                <DialogFooter className="flex sm:justify-center w-full gap-2">
                    <Button variant="secondary" onClick={handleDismiss}>
                        Cancel
                    </Button>
                    <Button onClick={handleResume}>
                        Resume Project
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

const ModalContentUserApprovalStoryboard = memo(({ interrupt }: { interrupt: any; }) => {
    const setInterrupt = usePipelineStore((s) => s.setInterrupt);
    const setStatus = usePipelineStore((s) => s.setStatus);
    const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
    const setIsLoading = useCanvasUIStore((s) => s.setIsLoading);
    const worldId = useWorldStore((s) => s.worldId);
    const { activeTeamId: teamId, user } = useAuth();

    const handleResume = async () => {
        if (!selectedProjectId) return;
        try {
            setStatus("generating");
            setIsLoading(false);
            await resumePipeline({
                projectId: selectedProjectId,
                payload: { resumeValue: true }
            });
            setInterrupt(null);
        } catch (error) {
            console.error('Error resuming pipeline:', error);
            setStatus("error");
        }
    };

    const handleDismiss = () => {
        setIsLoading(false);
        setInterrupt(null);
    };

    return (
        <Dialog open={!!interrupt} onOpenChange={(open) => !open && handleDismiss()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-center">Review Storyboard</DialogTitle>
                    <DialogDescription>
                        Review scenes, and make revisions before generating images.
                    </DialogDescription>
                </DialogHeader>

                <p className=" text-muted-foreground">
                    Once you are satisfied, click Resume Project to begin generating images.
                </p>

                <DialogFooter className="flex sm:justify-center w-full gap-2">
                    <Button variant="secondary" onClick={handleDismiss}>
                        Cancel
                    </Button>
                    <Button onClick={handleResume}>
                        Resume Project
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});


import { useState, useEffect, useMemo, memo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '#/components/ui/dialog.js';
import { Button } from '#/components/ui/button.js';
import { useStore, InterruptionState } from '#/lib/store.js';
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert.js';
import { AlertCircle } from 'lucide-react';
import { Textarea } from '#/components/ui/textarea.js';
import { resolveIntervention, resumePipeline } from '#/lib/api.js';

export function CompoundModal() {
    const { interruptState, setInterruptState, setProjectStatus, selectedProject, setIsLoading } = useStore();

    if (!interruptState) return null;

    return interruptState.type === "user_approval" ?
        <ModalContentUserApproval interruptState={ interruptState } /> :
        <ModalContentErrorIntervention interruptState={ interruptState } />;
}

const ModalContentErrorIntervention = memo(({ interruptState }: { interruptState: InterruptionState; }) => {

    const { setInterruptState, setProjectStatus, selectedProject, setIsLoading } = useStore();
    const [ paramsJson, setParamsJson ] = useState<string>('');
    const [ jsonError, setJsonError ] = useState<string | null>(null);

    useEffect(() => {
        if (interruptState) {
            setParamsJson(typeof interruptState.currentParams === 'string' ? interruptState.currentParams : JSON.stringify(interruptState.currentParams));
        }
    }, [ interruptState ]);

    const handleResolve = async (action: any, revisedParams?: any) => {
        if (!selectedProject) return;

        try {
            await resolveIntervention({
                projectId: selectedProject,
                payload: {
                    action,
                    revisedParams,
                    jobType: interruptState.functionName
                }
            });

            setProjectStatus("generating");
            setIsLoading(false);
            setInterruptState(null);
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
        <Dialog open={ !!interruptState } onOpenChange={ (open) => !open && handleResolve('abort') }>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Human Intervention Required</DialogTitle>
                    <DialogDescription>
                        An error occurred during { interruptState.functionName || 'LLM execution' }.
                        Please review the error and parameters.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription className="font-mono  whitespace-pre-wrap">
                            { interruptState.error }
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                        <label className=" font-medium">Parameters (JSON)</label>
                        <Textarea
                            value={ paramsJson }
                            onChange={ (e) => {
                                setParamsJson(e.target.value);
                                setJsonError(null);
                            } }
                            className="font-mono  h-[300px]"
                        />
                        { jsonError && (
                            <p className="text-destructive ">{ jsonError }</p>
                        ) }
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button onClick={ () => handleResolve('abort') }>
                        Cancel Operation
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={ () => handleResolve('retry') }>
                            Retry Original
                        </Button>
                        <Button onClick={ handleRetryWithChanges }>
                            Retry with Changes
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>;
});

const ModalContentUserApproval = memo(({ interruptState }: { interruptState: InterruptionState; }) => {
    const { setInterruptState, setProjectStatus, selectedProject, setIsLoading } = useStore();
    const [ open, setOpen ] = useState(true);
    return (
        <Dialog open={ open } onOpenChange={ (open) => setOpen(false) }>
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

                <DialogFooter className="flex sm:justify-center w-full">
                    <Button onClick={ () => setOpen(false) }>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});


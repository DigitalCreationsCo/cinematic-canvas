import { cn } from "@/utils/utils";
import { useDeploymentStepper } from "../contexts/deployment-stepper-context";

const CREATE_STEPS = [
  { number: 1, label: "Provider" },
  { number: 2, label: "Type" },
  { number: 3, label: "Attach Flows" },
  { number: 4, label: "Review" },
] as const;

const EDIT_STEPS = [
  { number: 1, label: "Type" },
  { number: 2, label: "Attach Flows" },
  { number: 3, label: "Review" },
] as const;

export const DEPLOYMENT_STEPS = CREATE_STEPS;

export default function DeploymentStepper() {
  const { currentStep, isEditMode } = useDeploymentStepper();
  const steps = isEditMode ? EDIT_STEPS : CREATE_STEPS;
  const stepsCount = steps.length;
  const progressPercent = ((currentStep - 1) / (stepsCount - 1)) * 100;

  // Position the line so it starts at the centre of the 1st step circle
  // and ends at the centre of the last step circle.
  // With flex-1 on every column, each step gets equal width and the circle
  // is centred inside it.  The first circle's centre is at
  // 100% / (2 × stepsCount) from the left; the last circle's centre is at
  // the same distance from the right.
  const lineInset = `${100 / (2 * stepsCount)}%`;

  return (
    <div className="relative mx-auto h-[52px] w-full max-w-[700px]">
      <div
        className="absolute top-4 h-[2px] bg-muted"
        style={{ left: lineInset, right: lineInset }}
      >
        <div
          className="h-full bg-foreground transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="relative flex h-full items-start">
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                currentStep >= step.number
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {step.number}
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-xs text-foreground",
                currentStep >= step.number && "font-medium",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

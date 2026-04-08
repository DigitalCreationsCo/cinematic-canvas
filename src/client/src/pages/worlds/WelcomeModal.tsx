import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Sparkles, Wand2, Compass, ArrowRight } from "lucide-react";

interface WelcomeModalProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onDismiss }) => {
  const handleGetStarted = () => {
    onDismiss();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-2xl card-cinematic-glass pb-12">
        <DialogHeader className="text-center p-4">
          <DialogTitle className="flex text-3xl text-center capitalize font-heading tracking-wide">
            Where imagination comes alive
          </DialogTitle>
          <DialogDescription className="text-lg w-[95%] mx-auto text-primary mt-2 text-center">
            Welcome to Cinematic Canvas.<br />
            Click <strong className="text-primary">Start Creating</strong> to bring your dreams to life.
            {/* Join our community with regular updates and community-steered roadmaps. */}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard
              icon={<Compass className="w-5 h-5" />}
              title="Craft Stories"
              description="Tell stories with narrative consistency"
            />
            <FeatureCard
              icon={<Wand2 className="w-5 h-5" />}
              title="Build Worlds"
              description="Create cinematic universes with AI"
            />
            <FeatureCard
              icon={<Sparkles className="w-5 h-5" />}
              title="Generate Videos"
              description="Transform your vision into video productions"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-center pt-4">
          <Button
            onClick={handleGetStarted}
            className="w-full sm:w-auto text-lg px-8 py-6"
          >
            Start Creating
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => {
  return (
    <div className="flex flex-col items-center text-center p-4 rounded-lg bg-background/50 transition-colors">
      <div className="mb-3 text-primary">
        {icon}
      </div>
      <h3 className="font-medium text-sm uppercase tracking-wide mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
};

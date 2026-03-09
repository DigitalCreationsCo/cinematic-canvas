import React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

export function GlobalNotifications() {
  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
      
      {/* Active Process Notification */}
      <div className="bg-card border border-border rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start">
        <Loader2 className="w-4 h-4 text-primary animate-spin mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold font-mono">BATCH PROCESSING</span>
            <span className="text-[10px] text-muted-foreground font-mono">2/5</span>
          </div>
          <span className="text-xs text-muted-foreground leading-tight">Rendering Scene 02 composite frames...</span>
          <div className="h-1 bg-background rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-primary w-2/5 transition-all duration-500" />
          </div>
        </div>
      </div>

      {/* Global Error */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group">
        <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 flex-1 pr-4">
          <span className="text-xs font-bold font-mono text-destructive">API RATE LIMIT</span>
          <span className="text-xs text-destructive/80 leading-tight">Audio generation service is currently experiencing high load. Retrying in 5s...</span>
        </div>
        <button className="absolute top-2 right-2 text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      </div>
      
      {/* Success Notification */}
      <div className="bg-success/10 border border-success/30 rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group opacity-50 hover:opacity-100 transition-opacity duration-300">
        <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 flex-1 pr-4">
          <span className="text-xs font-bold font-mono text-success">ASSET IMPORTED</span>
          <span className="text-xs text-success/80 leading-tight">Successfully imported 'Cyberpunk_Chase.wav'</span>
        </div>
      </div>

    </div>
  );
}

export function PerformanceMetrics() {
  return (
    <div className="absolute bottom-4 right-4 z-50 pointer-events-none">
      <div className="bg-card/80 backdrop-blur-md border border-border rounded-md shadow-sm p-2 flex gap-4 pointer-events-auto text-[10px] font-mono text-muted-foreground">
        <div className="flex flex-col">
          <span className="uppercase opacity-50">GPU MEM</span>
          <span className="text-foreground font-bold">14.2 / 24 GB</span>
        </div>
        <div className="w-px bg-border h-6 my-auto" />
        <div className="flex flex-col">
          <span className="uppercase opacity-50">WORKERS</span>
          <span className="text-success font-bold">4 ACTIVE</span>
        </div>
        <div className="w-px bg-border h-6 my-auto" />
        <div className="flex flex-col">
          <span className="uppercase opacity-50">LATENCY</span>
          <span className="text-foreground font-bold">42ms</span>
        </div>
      </div>
    </div>
  );
}
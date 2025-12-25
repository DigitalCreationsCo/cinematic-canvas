import { useStore } from "@/lib/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DebugStatePanel() {
    const store = useStore();
    const { toast } = useToast();

    // Filter out functions (actions) to show only state data
    const stateData = Object.fromEntries(
        Object.entries(store).filter(([ _, value ]) => typeof value !== 'function')
    );

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(stateData, null, 2));
        toast({
            title: "Copied to clipboard",
            description: "Full state JSON copied to clipboard",
        });
    };

    return (
        <div className="h-full p-4">
            <Card className="h-full flex flex-col">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm font-semibold">Application State (Debug)</CardTitle>
                    <Button variant="outline" size="sm" onClick={ handleCopy }>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy JSON
                    </Button>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full w-full">
                        <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                            { JSON.stringify(stateData, null, 2) }
                        </pre>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

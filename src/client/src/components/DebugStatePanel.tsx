import React, { useEffect, useState } from "react";
import { useProjectStore } from "../store/useProjectStore.js";
import { useAssetStore } from "../store/useAssetStore.js";
import { usePipelineStore } from "../store/usePipelineStore.js";
import { useCanvasUIStore } from "../store/useCanvasUIStore.js";
import { useNodeStore } from "../store/useNodeStore.js";
import { useWorldStore } from "../store/useWorldStore.js";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card.js";
import { Button } from "#/components/ui/button.js";
import { Copy, ChevronRight, ChevronDown, RefreshCw } from "lucide-react";
import ConnectionStatus from "./ConnectionStatus.js";

interface JsonNodeProps {
    label?: string;
    data: any;
    level?: number;
    dataType?: string;
}

const JsonNode: React.FC<JsonNodeProps> = ({ label, data, level = 0, dataType }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isObject = data !== null && typeof data === "object";
    const isArray = Array.isArray(data);
    const isEmpty = isObject && Object.keys(data).length === 0;

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isEmpty) setIsOpen(!isOpen);
    };

    const indentClass = level > 0 ? "ml-4   pl-2" : "";

    if (!isObject) {
        let valueColor = "text-foreground";
        if (typeof data === "string") valueColor = "text-green-500";
        if (typeof data === "number") valueColor = "text-orange-500";
        if (typeof data === "boolean") valueColor = "text-blue-500";
        if (data === null || data === undefined) valueColor = "text-muted-foreground";

        return (
            <div className={`flex items-start font-mono  py-0.5 ${indentClass}`}>
                {label && <span className="text-muted-foreground mr-2 select-none">{label}:</span>}
                <span className={`${valueColor} break-all`}>
                    {typeof data === 'string' ? `"${data}"` : String(data)}
                </span>
            </div>
        );
    }

    const keys = Object.keys(data);
    const itemCount = keys.length;

    const typeIndicator = dataType ? (
        <span className="text-blue-400 mr-1 ">{dataType}</span>
    ) : null;

    const preview = isArray
        ? `Array(${itemCount})`
        : `Object {${itemCount}}`;

    return (
        <div className={`font-mono  ${indentClass}`}>
            <div
                className="flex items-center py-0.5 cursor-pointer hover:bg-muted/50  select-none group"
                onClick={toggle}
            >
                <span className="w-4 h-4 mr-1 flex items-center justify-center text-muted-foreground">
                    {!isEmpty && (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                </span>
                {label && <span className="text-purple-500 mr-2 font-medium">{label}:</span>}
                {typeIndicator}
                <span className="text-muted-foreground opacity-70 group-hover:opacity-100 transition-opacity">
                    {isEmpty ? (isArray ? "[]" : "{}") : preview}
                </span>
            </div>

            {isOpen && !isEmpty && (
                <div className="ml-2">
                    {keys.map((key) => (
                        <JsonNode key={key} label={key} data={data[key]} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

const JsonTree: React.FC<{ data: any; }> = ({ data }) => {
    return (
        <div className="space-y-1">
            {Object.entries(data).map(([key, value]) => {
                // Check if this was originally a Map or Set (we flag it during serialization)
                const dataType = (value as any)?.__originalType;
                return (
                    <JsonNode key={key} label={key} data={value} level={0} dataType={dataType} />
                );
            })}
        </div>
    );
};

/**
 * Serialize state for display, converting Maps/Sets to plain objects/arrays
 * so JsonTree can render them.
 * 
 * Note: Maps and Sets don't have enumerable properties, so
 * Object.keys(map) returns []. We convert them to plain objects with a
 * __originalType flag so the tree can display them AND show their type.
 */
function serializeState(state: any): any {
    // Filter out functions
    const dataOnly = Object.fromEntries(
        Object.entries(state).filter(([_, value]) => typeof value !== "function")
    );

    // Deep serialize to handle nested Maps/Sets
    return deepSerialize(dataOnly);
}

function deepSerialize(value: any): any {
    // Null or primitive
    if (value === null || typeof value !== "object") {
        return value;
    }

    // Map → plain object with entries
    if (value instanceof Map) {
        const obj: any = { __originalType: "Map" };
        value.forEach((val, key) => {
            obj[String(key)] = deepSerialize(val);
        });
        return obj;
    }

    // Set → array with values
    if (value instanceof Set) {
        return {
            __originalType: "Set",
            values: Array.from(value).map(deepSerialize),
        };
    }

    // Date → ISO string
    if (value instanceof Date) {
        return value.toISOString();
    }

    // Array → map elements
    if (Array.isArray(value)) {
        return value.map(deepSerialize);
    }

    // Plain object → recurse
    const obj: any = {};
    for (const [k, v] of Object.entries(value)) {
        obj[k] = deepSerialize(v);
    }
    return obj;
}

/**
 * Snapshot state via useStore.getState() on a 1-second interval. The
 * panel updates predictably, never shows data older than 1s, and doesn't
 * trigger re-renders of itself on every tiny state mutation.
 */
export default function DebugStatePanel() {
    const addMessage = usePipelineStore((s) => s.pushEvent);
    const connectionStatus = usePipelineStore((s) => s.connectionStatus);

    const [stateSnapshot, setStateSnapshot] = useState<any>({});
    const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

    useEffect(() => {
        const captureState = () => {
            const combinedState = {
                project: useProjectStore.getState(),
                assets: useAssetStore.getState(),
                pipeline: usePipelineStore.getState(),
                ui: useCanvasUIStore.getState(),
                nodes: useNodeStore.getState(),
                world: useWorldStore.getState(),
            };
            const serialized = serializeState(combinedState);
            setStateSnapshot(serialized);
            setLastUpdate(Date.now());
        };

        captureState();
        const interval = setInterval(captureState, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleCopy = () => {
        const cleaned = JSON.parse(
            JSON.stringify(stateSnapshot, (key, value) => {
                if (key === "__originalType") return undefined;
                return value;
            })
        );
        navigator.clipboard.writeText(JSON.stringify(cleaned, null, 2));
        addMessage({
            id: Date.now().toString(),
            type: "info",
            message: "Full state JSON copied to clipboard",
            timestamp: new Date(),
        });
    };

    const handleRefresh = () => {
        const combinedState = {
            project: useProjectStore.getState(),
            assets: useAssetStore.getState(),
            pipeline: usePipelineStore.getState(),
            ui: useCanvasUIStore.getState(),
            nodes: useNodeStore.getState(),
            world: useWorldStore.getState(),
        };
        const serialized = serializeState(combinedState);
        setStateSnapshot(serialized);
        setLastUpdate(Date.now());
        addMessage({
            id: Date.now().toString(),
            type: "info",
            message: "Debug panel updated with latest state",
            timestamp: new Date(),
        });
    };


    const timeSinceUpdate = Math.floor((Date.now() - lastUpdate) / 1000);
    const staleness = timeSinceUpdate === 0 ? "just now" : `${timeSinceUpdate}s ago`;

    return (
        <div className="h-full p-4 select-text">
            <Card className="h-full flex flex-col">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0 shrink-0">
                    <div className="flex items-center gap-2">
                        <CardTitle className=" font-semibold">Application State (Debug)</CardTitle>
                        <span className=" text-muted-foreground">Updated {staleness}</span>
                        <ConnectionStatus connected={connectionStatus === 'connected'} />
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={handleRefresh}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleCopy}>
                            <Copy className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                    <ScrollArea className="h-full w-full p-4">
                        <JsonTree data={stateSnapshot} />
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

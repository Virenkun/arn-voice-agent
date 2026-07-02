"use client";

import { Brain, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { formatConversationValue } from "./utils";

interface ToolCallCardProps {
    functionName: string;
    status: "running" | "completed";
    argumentsValue?: unknown;
    resultValue?: unknown;
    reasoningDurationMs?: number;
}

/** Results arrive as serialized JSON strings; parse when possible so we can
 * split the tool executor's `request` echo from the response. Older runs
 * stored Python-repr strings — those fall through and render raw. */
function parseMaybeJson(value: unknown): unknown {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Section({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {label}
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-background/70 p-3 text-xs leading-5 text-foreground">
                {formatConversationValue(value)}
            </pre>
        </div>
    );
}

export function ToolCallCard({
    functionName,
    status,
    argumentsValue,
    resultValue,
    reasoningDurationMs,
}: ToolCallCardProps) {
    const [open, setOpen] = useState(false);
    const hasArguments = argumentsValue !== undefined;
    const hasResult = resultValue !== undefined;
    const hasDetails = hasArguments || hasResult;

    // Split the executor's request echo out of the result so the card shows
    // "Request Sent" (method/url/headers/body) and "Response" separately.
    const parsedResult = parseMaybeJson(resultValue);
    let requestPart: unknown;
    let responsePart: unknown = parsedResult;
    if (isPlainObject(parsedResult) && parsedResult.request !== undefined) {
        const { request, ...rest } = parsedResult;
        requestPart = request;
        responsePart = rest;
    }
    const isError =
        isPlainObject(parsedResult) && parsedResult.status === "error";

    return (
        <div className="flex justify-center">
            <div className="flex w-full max-w-[85%] flex-col gap-1">
                {reasoningDurationMs !== undefined ? (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <Brain className="h-3 w-3" />
                        <span className="font-medium">Reasoning Delay:</span>
                        <span>{Math.round(reasoningDurationMs)}ms</span>
                    </div>
                ) : null}
                <Collapsible
                    open={hasDetails ? open : false}
                    onOpenChange={hasDetails ? setOpen : undefined}
                    className="rounded-2xl border border-amber-500/20 bg-amber-500/10"
                >
                    <div className="flex items-start gap-2 px-3.5 py-3 text-sm">
                        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-xs text-amber-700 dark:text-amber-400">
                                    {functionName}()
                                </span>
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "h-5 px-1.5 text-[10px] uppercase tracking-[0.14em]",
                                        status === "running"
                                            ? "border-amber-400/60 text-amber-700 dark:text-amber-300"
                                            : isError
                                                ? "border-red-500/40 text-red-700 dark:text-red-300"
                                                : "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
                                    )}
                                >
                                    {status === "running"
                                        ? "Running"
                                        : isError
                                            ? "Failed"
                                            : "Completed"}
                                </Badge>
                            </div>
                            {hasDetails ? (
                                <div className="mt-2">
                                    <CollapsibleTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                        >
                                            <ChevronRight
                                                className={cn(
                                                    "h-3.5 w-3.5 transition-transform",
                                                    open && "rotate-90",
                                                )}
                                            />
                                            Details
                                        </button>
                                    </CollapsibleTrigger>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    {hasDetails ? (
                        <CollapsibleContent className="border-t border-amber-500/20 px-3.5 py-3">
                            <div className="space-y-3">
                                {hasArguments ? (
                                    <Section
                                        label="Arguments (from the agent)"
                                        value={parseMaybeJson(argumentsValue)}
                                    />
                                ) : null}
                                {requestPart !== undefined ? (
                                    <Section label="Request Sent (API)" value={requestPart} />
                                ) : null}
                                {hasResult ? (
                                    <Section
                                        label={requestPart !== undefined ? "Response (API)" : "Result"}
                                        value={responsePart}
                                    />
                                ) : null}
                            </div>
                        </CollapsibleContent>
                    ) : null}
                </Collapsible>
            </div>
        </div>
    );
}

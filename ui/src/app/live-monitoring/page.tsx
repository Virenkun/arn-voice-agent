"use client";

import { Loader2, Phone, Radio,RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { listOngoingCallsApiV1MonitoringCallsGet } from "@/client/sdk.gen";
import type { OngoingCallSchema } from "@/client/types.gen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

import { MonitorListenPanel } from "./MonitorListenPanel";

function formatElapsed(startedAt: string, now: number): string {
    const start = new Date(startedAt).getTime();
    if (!startedAt || Number.isNaN(start)) return "—";
    const seconds = Math.max(0, Math.floor((now - start) / 1000));
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export default function LiveMonitoringPage() {
    const { user, loading: authLoading } = useAuth();

    const [calls, setCalls] = useState<OngoingCallSchema[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [selected, setSelected] = useState<OngoingCallSchema | null>(null);
    const firstLoad = useRef(true);

    const fetchCalls = useCallback(async () => {
        const response = await listOngoingCallsApiV1MonitoringCallsGet();
        if (response.error) {
            setError(detailFromError(response.error, "Failed to load ongoing calls"));
        } else {
            setError(null);
            setCalls(response.data ?? []);
        }
        setLoading(false);
        firstLoad.current = false;
    }, []);

    // Poll the ongoing-calls list (nothing pushes it today).
    useEffect(() => {
        if (authLoading || !user) return;
        void fetchCalls();
        const id = setInterval(() => void fetchCalls(), 5000);
        return () => clearInterval(id);
    }, [authLoading, user, fetchCalls]);

    // Tick every second so elapsed timers stay live between polls.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="container mx-auto max-w-6xl p-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold">
                        <Radio className="h-6 w-6" /> Live Monitoring
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Listen in on ongoing calls and take over or steer the AI in real time.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchCalls()}
                    disabled={loading}
                >
                    <RefreshCw className="mr-1 h-4 w-4" /> Refresh
                </Button>
            </div>

            {error ? (
                <Card className="border-destructive/50">
                    <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
                </Card>
            ) : null}

            {loading && firstLoad.current ? (
                <div className="flex items-center justify-center py-24 text-muted-foreground">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading ongoing calls…
                </div>
            ) : calls.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                        <Phone className="h-8 w-8" />
                        <p className="font-medium">No ongoing calls right now</p>
                        <p className="text-sm">Active calls will appear here as they start.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {calls.map((call) => (
                        <Card key={call.id} className="flex flex-col">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center justify-between gap-2 text-base">
                                    <span className="truncate">
                                        {call.workflow_name ?? `Workflow ${call.workflow_id}`}
                                    </span>
                                    <span className="shrink-0 font-mono text-sm text-muted-foreground">
                                        {formatElapsed(call.started_at, now)}
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 flex-col gap-3">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    {call.call_type ? (
                                        <Badge variant="outline" className="capitalize">
                                            {call.call_type}
                                        </Badge>
                                    ) : null}
                                    {call.mode ? (
                                        <Badge variant="secondary">{call.mode}</Badge>
                                    ) : null}
                                </div>
                                {call.phone_number ? (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        <Phone className="h-3.5 w-3.5" /> {call.phone_number}
                                    </div>
                                ) : null}
                                {call.campaign_name ? (
                                    <div className="truncate text-sm text-muted-foreground">
                                        Campaign: {call.campaign_name}
                                    </div>
                                ) : null}
                                <div className="mt-auto">
                                    <Button
                                        className="w-full"
                                        onClick={() => setSelected(call)}
                                    >
                                        <Radio className="mr-1 h-4 w-4" /> Listen
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Sheet
                open={selected !== null}
                onOpenChange={(open) => !open && setSelected(null)}
            >
                <SheetContent
                    side="right"
                    className="flex w-full flex-col gap-4 sm:max-w-lg"
                >
                    <SheetHeader>
                        <SheetTitle>
                            {selected?.workflow_name ?? "Live call"}
                        </SheetTitle>
                        <SheetDescription>
                            {selected?.phone_number
                                ? `${selected.call_type ?? "call"} · ${selected.phone_number}`
                                : "Listening to a live call"}
                        </SheetDescription>
                    </SheetHeader>
                    <div className="min-h-0 flex-1">
                        {selected ? (
                            <MonitorListenPanel workflowRunId={selected.id} enabled />
                        ) : null}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

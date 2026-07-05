"use client";

import {
    Loader2,
    Mic,
    MicOff,
    Radio,
    Send,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConversationContainer } from "@/components/workflow/conversation";
import { conversationItemsFromRealtimeFeedbackEvents } from "@/components/workflow/conversation/adapters/fromRealtimeFeedback";
import { ConversationTimeline } from "@/components/workflow/conversation/ConversationTimeline";

import { useMonitorSocket } from "./useMonitorSocket";

interface MonitorListenPanelProps {
    workflowRunId: number;
    enabled: boolean;
}

export function MonitorListenPanel({ workflowRunId, enabled }: MonitorListenPanelProps) {
    const {
        status,
        events,
        speaker,
        muted,
        setMuted,
        bargeInActive,
        startBargeIn,
        stopBargeIn,
        steerText,
    } = useMonitorSocket({ workflowRunId, enabled });

    const [steerValue, setSteerValue] = useState("");
    const items = conversationItemsFromRealtimeFeedbackEvents(events);

    // Push-to-talk: hold the button to speak to the caller, release to hand
    // control back to the AI. Pointer capture keeps the release firing even if
    // the cursor leaves the button while held.
    const holdingRef = useRef(false);
    const beginBarge = useCallback(
        (e: React.PointerEvent) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            holdingRef.current = true;
            void startBargeIn();
        },
        [startBargeIn],
    );
    const endBarge = useCallback(() => {
        if (holdingRef.current) {
            holdingRef.current = false;
            stopBargeIn();
        }
    }, [stopBargeIn]);

    const submitSteer = useCallback(() => {
        if (!steerValue.trim()) return;
        steerText(steerValue);
        setSteerValue("");
    }, [steerText, steerValue]);

    const connected = status === "connected";

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <StatusBadge status={status} />
                    {speaker ? (
                        <Badge variant="outline" className="capitalize">
                            {speaker} speaking
                        </Badge>
                    ) : null}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMuted(!muted)}
                    disabled={!connected}
                    aria-label={muted ? "Unmute" : "Mute"}
                >
                    {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    <span className="ml-1">{muted ? "Muted" : "Listening"}</span>
                </Button>
            </div>

            {/* Live transcript */}
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
                <ConversationContainer
                    title="Live Transcript"
                    status={connected ? "live" : status === "idle" ? "ended" : "ready"}
                    messageCount={items.length || undefined}
                >
                    <ConversationTimeline
                        items={items}
                        autoScroll
                        emptyState={{
                            title: "Waiting for the conversation…",
                            subtitle: connected
                                ? "Transcript will appear as the call continues"
                                : "Connecting to the live call",
                        }}
                    />
                </ConversationContainer>
            </div>

            {/* Supervisor controls */}
            <div className="shrink-0 space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                    <Button
                        variant={bargeInActive ? "destructive" : "default"}
                        className="flex-1 select-none"
                        disabled={!connected}
                        onPointerDown={beginBarge}
                        onPointerUp={endBarge}
                        onPointerCancel={endBarge}
                    >
                        {bargeInActive ? (
                            <Mic className="h-4 w-4" />
                        ) : (
                            <MicOff className="h-4 w-4" />
                        )}
                        <span className="ml-1">
                            {bargeInActive ? "Speaking to caller…" : "Hold to talk (barge-in)"}
                        </span>
                    </Button>
                </div>
                <div className="flex items-start gap-2">
                    <Textarea
                        value={steerValue}
                        onChange={(e) => setSteerValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                submitSteer();
                            }
                        }}
                        placeholder="Whisper to the AI (e.g. offer a 10% discount) — the caller won't hear this"
                        rows={2}
                        className="resize-none"
                        disabled={!connected}
                    />
                    <Button
                        size="icon"
                        onClick={submitSteer}
                        disabled={!connected || !steerValue.trim()}
                        aria-label="Send instruction to AI"
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    if (status === "connected") {
        return (
            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400">
                <Radio className="mr-1 h-3 w-3" /> Connected
            </Badge>
        );
    }
    if (status === "connecting") {
        return (
            <Badge variant="secondary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Connecting
            </Badge>
        );
    }
    if (status === "error") {
        return <Badge variant="destructive">Connection error</Badge>;
    }
    return <Badge variant="outline">Disconnected</Badge>;
}

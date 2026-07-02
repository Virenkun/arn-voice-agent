"use client";

import { Loader2, PhoneOff, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createToolDefinition, getCategoryConfig } from "@/app/tools/config";
import { useWorkflow } from "@/app/workflow/[workflowId]/contexts/WorkflowContext";
import { useWorkflowStore } from "@/app/workflow/[workflowId]/stores/workflowStore";
import { createToolApiV1ToolsPost } from "@/client/sdk.gen";
import type { NodeSpec } from "@/client/types.gen";
import { useNodeHandlers } from "@/components/flow/nodes/common/useNodeHandlers";
import { NodeEditForm, useNodeSpecs } from "@/components/flow/renderer";
import { FlowNodeData } from "@/components/flow/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Seed flat form values from node data (mirrors GenericNode.seedValues — kept
// local to avoid coupling the single-prompt editor to the canvas node).
function seedValues(data: FlowNodeData, spec: NodeSpec): Record<string, unknown> {
    const d = data as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const prop of spec.properties) {
        out[prop.name] = d[prop.name] ?? prop.default ?? undefined;
    }
    return out;
}

interface SinglePromptEditorProps {
    workflowId: number;
}

/**
 * Full-page editor for a "single prompt" agent. A single-prompt agent is a
 * one-node workflow (a `startCall` node), so this just renders that node's
 * spec-driven config form (`NodeEditForm`) inline — giving prompt, greeting,
 * interruptions, knowledge base and tools for free — plus an "end the call"
 * convenience toggle. Model/voice/telephony stay in the per-agent Settings tab.
 *
 * Edits are committed straight into the Zustand workflow store so the shared
 * editor header (Save / Cmd+S / Publish) and the tester persist them unchanged.
 */
export function SinglePromptEditor({ workflowId }: SinglePromptEditorProps) {
    const router = useRouter();
    const { bySpecName } = useNodeSpecs();
    const spec = bySpecName.get("startCall");
    const { tools, documents, recordings, saveWorkflow, workflowUuid, onToolCreated } = useWorkflow();

    const nodes = useWorkflowStore((s) => s.nodes);
    const startNode = useMemo(
        () =>
            nodes.find((n) => n.type === "startCall") ??
            nodes.find((n) => n.data?.is_start) ??
            nodes[0],
        [nodes],
    );
    const startNodeId = startNode?.id ?? "";
    const { handleSaveNodeData } = useNodeHandlers({
        id: startNodeId,
        additionalData: { is_start: true },
    });

    // Local editing state — seeded once, then it's the source of truth while
    // editing. We never re-seed from the store, so committing back can't fight
    // the user's cursor.
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [seeded, setSeeded] = useState(false);
    useEffect(() => {
        if (!seeded && spec && startNode) {
            setValues({
                ...seedValues(startNode.data, spec),
                mcp_tool_filters: startNode.data.mcp_tool_filters,
            });
            setSeeded(true);
        }
    }, [seeded, spec, startNode]);

    // Commit edits into the store (flips isDirty → header Save/Publish persist).
    const commit = useCallback(
        (next: Record<string, unknown>) => {
            setValues(next);
            if (startNode) {
                handleSaveNodeData({
                    ...startNode.data,
                    ...(next as Partial<FlowNodeData>),
                });
            }
        },
        [startNode, handleSaveNodeData],
    );

    // Hide the node's internal "name" field — the agent's name is the workflow
    // name (edited in the header).
    const formSpec = useMemo<NodeSpec | undefined>(
        () =>
            spec
                ? { ...spec, properties: spec.properties.filter((p) => p.name !== "name") }
                : undefined,
        [spec],
    );

    // ── "Let the agent end the call" toggle ───────────────────────────────
    // End-call is an org-level tool with category "end_call"; a node "uses" it
    // by listing its uuid in tool_uuids. Find an existing one or create it.
    const [pendingEndCallUuid, setPendingEndCallUuid] = useState<string | null>(null);
    const [endCallBusy, setEndCallBusy] = useState(false);
    // Prefer an end-call tool scoped to THIS agent; fall back to an org-global one.
    const existingEndCallUuid = useMemo(() => {
        const active = tools?.filter(
            (t) => t.category === "end_call" && t.status === "active",
        );
        const scoped = active?.find((t) => t.workflow_uuid && t.workflow_uuid === workflowUuid);
        const global = active?.find((t) => !t.workflow_uuid);
        return scoped?.tool_uuid ?? global?.tool_uuid ?? null;
    }, [tools, workflowUuid]);
    const endCallUuid = existingEndCallUuid ?? pendingEndCallUuid;
    const toolUuids = (values.tool_uuids as string[] | undefined) ?? [];
    const endCallEnabled = !!endCallUuid && toolUuids.includes(endCallUuid);

    const toggleEndCall = useCallback(
        async (checked: boolean) => {
            if (endCallBusy || !startNode) return;
            setEndCallBusy(true);
            try {
                let uuid = endCallUuid;
                if (checked && !uuid) {
                    // No usable end-call tool yet — create one SCOPED TO THIS
                    // AGENT, reusing the Tools defaults.
                    const cfg = getCategoryConfig("end_call");
                    const res = await createToolApiV1ToolsPost({
                        body: {
                            name: cfg?.autoFill?.name ?? "End Call",
                            description: cfg?.autoFill?.description ?? undefined,
                            category: "end_call",
                            icon: cfg?.iconName ?? "phone-off",
                            icon_color: cfg?.iconColor ?? "#EF4444",
                            definition: createToolDefinition("end_call"),
                            workflow_uuid: workflowUuid,
                        },
                    });
                    if (res.error || !res.data?.tool_uuid) {
                        throw new Error("Failed to create end-call tool");
                    }
                    uuid = res.data.tool_uuid;
                    setPendingEndCallUuid(uuid);
                    // Surface the new tool in the editor's tools list immediately
                    // (previously it only appeared after a page reload).
                    onToolCreated?.(res.data);
                }
                if (!uuid) return;
                const current = (values.tool_uuids as string[] | undefined) ?? [];
                const nextUuids = checked
                    ? Array.from(new Set([...current, uuid]))
                    : current.filter((u) => u !== uuid);
                commit({ ...values, tool_uuids: nextUuids.length > 0 ? nextUuids : undefined });
                await saveWorkflow();
            } catch {
                toast.error("Couldn't update the end-call setting");
            } finally {
                setEndCallBusy(false);
            }
        },
        [endCallBusy, startNode, endCallUuid, values, commit, saveWorkflow, workflowUuid, onToolCreated],
    );

    if (!spec || !formSpec || !startNode) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold">Single Prompt Agent</h1>
                        <p className="text-sm text-muted-foreground">
                            One prompt drives the whole conversation. Model, voice, and telephony live in Settings.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => router.push(`/workflow/${workflowId}/settings`)}
                    >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                    </Button>
                </div>

                <NodeEditForm
                    spec={formSpec}
                    values={values}
                    onChange={commit}
                    context={{
                        tools: tools ?? [],
                        documents: documents ?? [],
                        recordings: recordings ?? [],
                        mcpToolFilters:
                            (values.mcp_tool_filters as Record<string, string[]> | undefined) ?? {},
                        onMcpToolFiltersChange: (next) =>
                            commit({
                                ...values,
                                mcp_tool_filters: Object.keys(next).length > 0 ? next : undefined,
                            }),
                    }}
                />

                <div className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div className="flex items-start gap-3">
                        <PhoneOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                            <Label className="text-sm font-medium">Let the agent end the call</Label>
                            <p className="text-xs text-muted-foreground">
                                The agent can hang up when the conversation is complete or the caller asks to.
                            </p>
                        </div>
                    </div>
                    <Switch
                        checked={endCallEnabled}
                        disabled={endCallBusy}
                        onCheckedChange={toggleEndCall}
                    />
                </div>
            </div>
        </div>
    );
}

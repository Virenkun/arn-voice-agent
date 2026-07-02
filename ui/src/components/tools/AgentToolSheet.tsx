"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
    getCategoryConfig,
    getToolTypeLabel,
    renderToolIcon,
    TOOL_CATEGORIES,
    type ToolCategory,
} from "@/app/tools/config";
import { useWorkflowOptional } from "@/app/workflow/[workflowId]/contexts/WorkflowContext";
import {
    createToolApiV1ToolsPost,
    updateToolApiV1ToolsToolUuidPut,
} from "@/client/sdk.gen";
import type { CreateToolRequest, ToolResponse } from "@/client/types.gen";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { detailFromError } from "@/lib/apiError";

import { ToolConfigFields } from "./ToolConfigFields";
import { useToolConfigForm } from "./useToolConfigForm";

export type AgentToolSheetMode =
    | { kind: "create" }
    | { kind: "edit"; tool: ToolResponse };

interface AgentToolSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowUuid: string;
    mode: AgentToolSheetMode;
    onSaved: (tool: ToolResponse) => void;
}

/**
 * Side sheet for creating/editing an AGENT-SCOPED tool inline from the agent
 * editor's tool picker — full per-category configuration (shared with the
 * /tools detail page via useToolConfigForm + ToolConfigFields), no page hop.
 * Created tools carry workflow_uuid, so only this agent sees them.
 */
export function AgentToolSheet({
    open,
    onOpenChange,
    workflowUuid,
    mode,
    onSaved,
}: AgentToolSheetProps) {
    const workflow = useWorkflowOptional();
    const recordings = workflow?.recordings ?? [];
    const form = useToolConfigForm();
    const { populateFromTool, setName, setDescription } = form;

    const isEdit = mode.kind === "edit";
    const [category, setCategory] = useState<ToolCategory>("http_api");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // (Re)seed whenever the sheet opens: edit mode loads the tool; create mode
    // starts on http_api with empty fields.
    useEffect(() => {
        if (!open) return;
        setError(null);
        if (mode.kind === "edit") {
            setCategory(mode.tool.category as ToolCategory);
            populateFromTool(mode.tool);
        } else {
            setCategory("http_api");
            setName("");
            setDescription("");
        }
        // populateFromTool/setName/setDescription are stable enough for this
        // open-transition seed; depending on `form` would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode]);

    // Mirror the /tools create dialog's autofill: picking a category with
    // suggested name/description fills empty (or previously autofilled) fields.
    const handleCategoryChange = (next: ToolCategory) => {
        const prevAuto = getCategoryConfig(category)?.autoFill;
        const nextAuto = getCategoryConfig(next)?.autoFill;
        if (nextAuto) {
            if (!form.name || form.name === prevAuto?.name) setName(nextAuto.name);
            if (!form.description || form.description === prevAuto?.description) {
                setDescription(nextAuto.description);
            }
        } else if (prevAuto) {
            if (form.name === prevAuto.name) setName("");
            if (form.description === prevAuto.description) setDescription("");
        }
        setCategory(next);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setError("Please enter a name for the tool");
            return;
        }
        const validationError = form.validate(category);
        if (validationError) {
            setError(validationError);
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            if (isEdit) {
                const response = await updateToolApiV1ToolsToolUuidPut({
                    path: { tool_uuid: mode.tool.tool_uuid },
                    body: {
                        name: form.name,
                        description: form.description || undefined,
                        definition: form.buildDefinition(category),
                    },
                });
                if (response.error || !response.data) {
                    setError(detailFromError(response.error, "Failed to save tool"));
                    return;
                }
                onSaved(response.data);
            } else {
                const categoryConfig = getCategoryConfig(category);
                const response = await createToolApiV1ToolsPost({
                    body: {
                        name: form.name,
                        description: form.description || undefined,
                        category,
                        icon: categoryConfig?.iconName || "globe",
                        icon_color: categoryConfig?.iconColor || "#3B82F6",
                        definition: form.buildDefinition(category),
                        workflow_uuid: workflowUuid,
                    } as CreateToolRequest,
                });
                if (response.error || !response.data) {
                    setError(detailFromError(response.error, "Failed to create tool"));
                    return;
                }
                onSaved(response.data);
            }
            onOpenChange(false);
        } catch (err) {
            console.error("Error saving agent tool:", err);
            setError(isEdit ? "Failed to save tool" : "Failed to create tool");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
            >
                <SheetHeader className="border-b px-6 py-4">
                    <SheetTitle>
                        {isEdit ? `Edit ${form.name || "Tool"}` : "Create tool for this agent"}
                    </SheetTitle>
                    <SheetDescription>
                        {isEdit
                            ? getToolTypeLabel(category)
                            : "This tool is scoped to this agent only — other agents won't see it."}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    {!isEdit && (
                        <div className="space-y-2">
                            <Label>Tool Type</Label>
                            <Select
                                value={category}
                                onValueChange={(v) => handleCategoryChange(v as ToolCategory)}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select tool type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TOOL_CATEGORIES.map((c) => (
                                        <SelectItem key={c.value} value={c.value} disabled={c.disabled}>
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className="flex h-5 w-5 items-center justify-center rounded"
                                                    style={{ backgroundColor: c.iconColor }}
                                                >
                                                    {renderToolIcon(c.value, "h-3 w-3 text-white")}
                                                </span>
                                                {c.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <ToolConfigFields
                        category={category}
                        form={form}
                        recordings={recordings}
                    />

                    {error && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}
                </div>

                <SheetFooter className="border-t px-6 py-4">
                    <div className="flex w-full items-center justify-end gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {isEdit ? "Saving..." : "Creating..."}
                                </>
                            ) : isEdit ? (
                                "Save"
                            ) : (
                                "Create Tool"
                            )}
                        </Button>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

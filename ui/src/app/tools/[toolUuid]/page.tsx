"use client";

import { ArrowLeft, Code, ExternalLink, Loader2, Save } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
    getToolApiV1ToolsToolUuidGet,
    listRecordingsApiV1WorkflowRecordingsGet,
    updateToolApiV1ToolsToolUuidPut,
} from "@/client/sdk.gen";
import type {
    RecordingResponseSchema,
    ToolResponse,
} from "@/client/types.gen";
import { ToolConfigFields, useToolConfigForm } from "@/components/tools";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TOOL_DOCUMENTATION_URLS } from "@/constants/documentation";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

import {
    getCategoryConfig,
    getToolTypeLabel,
    renderToolIcon,
    type ToolCategory,
} from "../config";

export default function ToolDetailPage() {
    const { toolUuid } = useParams<{ toolUuid: string }>();
    const { user, getAccessToken, redirectToLogin, loading } = useAuth();
    const router = useRouter();

    const [tool, setTool] = useState<ToolResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [showCodeDialog, setShowCodeDialog] = useState(false);

    // All per-category form state + populate/validate/build logic (shared with
    // the agent editor's inline tool sheet).
    const form = useToolConfigForm();
    const { populateFromTool } = form;

    // Org-level recordings for audio dropdowns
    const [recordings, setRecordings] = useState<RecordingResponseSchema[]>([]);

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    const fetchTool = useCallback(async () => {
        if (loading || !user || !toolUuid) return;

        try {
            setIsLoading(true);
            setError(null);
            const accessToken = await getAccessToken();

            const response = await getToolApiV1ToolsToolUuidGet({
                path: { tool_uuid: toolUuid },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (response.data) {
                setTool(response.data);
                populateFromTool(response.data);
            }
        } catch (err) {
            setError("Failed to fetch tool");
            console.error("Error fetching tool:", err);
        } finally {
            setIsLoading(false);
        }
        // populateFromTool is recreated every render (plain function from the
        // hook); depending on it would refetch in a loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, user, toolUuid, getAccessToken]);

    const fetchRecordings = useCallback(async () => {
        if (loading || !user) return;
        try {
            const response = await listRecordingsApiV1WorkflowRecordingsGet({
                query: {},
            });
            if (response.data) {
                setRecordings(response.data.recordings);
            }
        } catch {
            // Non-critical — dropdowns will show "No recordings available"
        }
    }, [loading, user]);

    useEffect(() => {
        fetchTool();
        fetchRecordings();
    }, [fetchTool, fetchRecordings]);

    const handleSave = async () => {
        if (!tool) return;

        const validationError = form.validate(tool.category);
        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setIsSaving(true);
            setError(null);
            setSaveSuccess(false);
            const accessToken = await getAccessToken();

            const response = await updateToolApiV1ToolsToolUuidPut({
                path: { tool_uuid: toolUuid },
                body: {
                    name: form.name,
                    description: form.description || undefined,
                    definition: form.buildDefinition(tool.category),
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (response.error) {
                setError(detailFromError(response.error, "Failed to save tool"));
                return;
            }

            if (response.data) {
                setTool(response.data);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            }
        } catch (err) {
            setError("Failed to save tool");
            console.error("Error saving tool:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const getCodeSnippet = () => {
        if (!tool) return "";

        const headersObj: Record<string, string> = {
            "Content-Type": "application/json",
        };
        form.headers.filter((h) => h.key && h.value).forEach((h) => {
            headersObj[h.key] = h.value;
        });

        // Build example body from parameters
        const exampleBody: Record<string, unknown> = {};
        form.parameters.forEach((p) => {
            if (p.type === "number") {
                exampleBody[p.name] = 0;
            } else if (p.type === "boolean") {
                exampleBody[p.name] = true;
            } else {
                exampleBody[p.name] = `<${p.name}>`;
            }
        });
        form.presetParameters.forEach((p) => {
            if (p.type === "number") {
                exampleBody[p.name] = p.valueTemplate || 0;
            } else if (p.type === "boolean") {
                exampleBody[p.name] = p.valueTemplate || true;
            } else {
                exampleBody[p.name] = p.valueTemplate || `<${p.name}>`;
            }
        });

        const hasBody =
            form.httpMethod !== "GET" &&
            form.httpMethod !== "DELETE" &&
            (form.parameters.length > 0 || form.presetParameters.length > 0);

        return `// ${tool.name}
// ${tool.description || "HTTP API Tool"}

const response = await fetch("${form.url}", {
    method: "${form.httpMethod}",
    headers: ${JSON.stringify(headersObj, null, 4)},${hasBody ? `
    body: JSON.stringify(${JSON.stringify(exampleBody, null, 4)}),` : ""}
});

const data = await response.json();`;
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="space-y-4">
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-64 w-96" />
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen">
                <div className="container mx-auto px-4 py-8">
                    <div className="max-w-4xl mx-auto space-y-6">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!tool) {
        return (
            <div className="min-h-screen">
                <div className="container mx-auto px-4 py-8">
                    <div className="max-w-4xl mx-auto text-center">
                        <h1 className="text-2xl font-bold mb-4">Tool not found</h1>
                        <Button onClick={() => router.push("/tools")}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Tools
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const isHttpApiTool = !["end_call", "transfer_call", "calculator", "mcp"].includes(tool.category);
    const categoryConfig = getCategoryConfig(tool.category as ToolCategory);

    return (
        <div className="min-h-screen">
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push("/tools")}
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{
                                        backgroundColor: tool.icon_color || categoryConfig?.iconColor || "#3B82F6",
                                    }}
                                >
                                    {renderToolIcon(tool.category)}
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold">{form.name}</h1>
                                    <p className="text-sm text-muted-foreground">
                                        {getToolTypeLabel(tool.category)}
                                        {tool.workflow_name ? ` · Agent: ${tool.workflow_name}` : ""}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isHttpApiTool && (
                                <Button
                                    variant="outline"
                                    onClick={() => setShowCodeDialog(true)}
                                >
                                    <Code className="w-4 h-4 mr-2" />
                                    View Code
                                </Button>
                            )}
                            {TOOL_DOCUMENTATION_URLS[tool.category] && (
                                <a
                                    href={TOOL_DOCUMENTATION_URLS[tool.category]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Docs
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </div>
                    </div>

                    <ToolConfigFields
                        category={tool.category}
                        form={form}
                        recordings={recordings}
                    />

                    {error && (
                        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
                            {error}
                        </div>
                    )}

                    {saveSuccess && (
                        <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-600">
                            Tool saved successfully!
                        </div>
                    )}

                    <div className="flex justify-end mt-6">
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    Save
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Code View Dialog (only for HTTP API tools) */}
            <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Code Preview</DialogTitle>
                        <DialogDescription>
                            JavaScript code to make this API call
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-muted rounded-lg p-4 font-mono text-sm overflow-auto max-h-96">
                        <pre>{getCodeSnippet()}</pre>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

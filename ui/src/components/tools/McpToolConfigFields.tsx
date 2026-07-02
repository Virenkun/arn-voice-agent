"use client";

import { CredentialSelector } from "@/components/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface McpToolConfigFieldsProps {
    name: string;
    onNameChange: (value: string) => void;
    description: string;
    onDescriptionChange: (value: string) => void;
    url: string;
    onUrlChange: (value: string) => void;
    credentialUuid: string;
    onCredentialUuidChange: (value: string) => void;
    toolsFilter: string;
    onToolsFilterChange: (value: string) => void;
}

/** MCP server configuration card (lifted from the tool detail page). */
export function McpToolConfigFields({
    name,
    onNameChange,
    description,
    onDescriptionChange,
    url,
    onUrlChange,
    credentialUuid,
    onCredentialUuidChange,
    toolsFilter,
    onToolsFilterChange,
}: McpToolConfigFieldsProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>MCP Server Configuration</CardTitle>
                <CardDescription>
                    Configure the MCP server endpoint. Its tools become available to the agent.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="mcp-name">Tool Name</Label>
                    <Input
                        id="mcp-name"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder="e.g., Customer MCP Server"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="mcp-description">Description</Label>
                    <p className="text-xs text-muted-foreground">
                        Provide a description which makes it easy for LLM to understand what this tool does
                    </p>
                    <Textarea
                        id="mcp-description"
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        placeholder="What does this MCP server provide?"
                        rows={3}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="mcp-url">MCP Server URL</Label>
                    <Input
                        id="mcp-url"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="https://your-mcp-server.example.com/mcp"
                    />
                </div>

                <div className="space-y-2">
                    <Label>Transport</Label>
                    <Input value="Streamable HTTP" disabled readOnly />
                </div>

                <CredentialSelector
                    value={credentialUuid}
                    onChange={onCredentialUuidChange}
                    label="Credential (Optional)"
                    description="Select a credential for authenticating with the MCP server, or leave empty for no auth."
                />

                <div className="space-y-2">
                    <Label htmlFor="mcp-tools-filter">Tools Filter (Optional)</Label>
                    <Input
                        id="mcp-tools-filter"
                        value={toolsFilter}
                        onChange={(e) => onToolsFilterChange(e.target.value)}
                        placeholder="e.g., tool_one, tool_two"
                    />
                    <p className="text-xs text-muted-foreground">
                        Comma-separated list of tool names to allow. Leave empty to expose all tools from the server.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

"use client";

import { useState } from "react";

import { createMcpDefinition, DEFAULT_END_CALL_REASON_DESCRIPTION, type EndCallMessageType, MCP_URL_PATTERN } from "@/app/tools/config";
import type {
    EndCallConfig,
    HttpApiToolDefinition,
    ToolResponse,
    TransferCallConfig as APITransferCallConfig,
    UpdateToolRequest,
} from "@/client/types.gen";
import {
    type HttpMethod,
    type KeyValueItem,
    type ParameterType,
    type PresetToolParameter,
    type ToolParameter,
    validateUrl,
} from "@/components/http";

export type ToolDefinitionPayload = NonNullable<UpdateToolRequest["definition"]>;

function normalizeParameterType(value: string | null | undefined): ParameterType {
    switch (value) {
        case "number":
        case "boolean":
        case "object":
        case "array":
            return value;
        default:
            return "string";
    }
}

/**
 * All per-category tool-configuration form state, plus populate / validate /
 * build-definition logic. Lifted verbatim from the tool detail page so the
 * same form can render both there and inline in the agent editor.
 *
 * State lives in the hook; rendering is done by <ToolConfigFields/> (or the
 * detail page directly, e.g. its code-snippet dialog reads form fields).
 */
export function useToolConfigForm() {
    // Common form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    // Shared form state
    const [customMessage, setCustomMessage] = useState("");

    // HTTP API form state
    const [httpMethod, setHttpMethod] = useState<HttpMethod>("POST");
    const [url, setUrl] = useState("");
    const [credentialUuid, setCredentialUuid] = useState("");
    const [headers, setHeaders] = useState<KeyValueItem[]>([]);
    const [parameters, setParameters] = useState<ToolParameter[]>([]);
    const [presetParameters, setPresetParameters] = useState<PresetToolParameter[]>([]);
    const [timeoutMs, setTimeoutMs] = useState(5000);
    const [customMessageType, setCustomMessageType] = useState<'text' | 'audio'>('text');
    const [customMessageRecordingId, setCustomMessageRecordingId] = useState("");

    // End Call form state
    const [endCallMessageType, setEndCallMessageType] = useState<EndCallMessageType>("none");
    const [endCallReason, setEndCallReason] = useState(false);
    const [endCallReasonDescription, setEndCallReasonDescription] = useState("");
    const [audioRecordingId, setAudioRecordingId] = useState("");

    const handleEndCallReasonChange = (enabled: boolean) => {
        setEndCallReason(enabled);
        if (enabled && !endCallReasonDescription) {
            setEndCallReasonDescription(DEFAULT_END_CALL_REASON_DESCRIPTION);
        }
    };

    // Transfer Call form state
    const [transferDestination, setTransferDestination] = useState("");
    const [transferMessageType, setTransferMessageType] = useState<EndCallMessageType>("none");
    const [transferTimeout, setTransferTimeout] = useState(30);
    const [transferAudioRecordingId, setTransferAudioRecordingId] = useState("");

    // MCP form state
    const [mcpUrl, setMcpUrl] = useState("");
    const [mcpCredentialUuid, setMcpCredentialUuid] = useState("");
    const [mcpToolsFilter, setMcpToolsFilter] = useState("");

    const populateFromTool = (tool: ToolResponse) => {
        setName(tool.name);
        setDescription(tool.description || "");

        if (tool.category === "end_call") {
            const config = tool.definition?.config as EndCallConfig | undefined;
            if (config) {
                setEndCallMessageType(config.messageType || "none");
                setCustomMessage(config.customMessage || "");
                setAudioRecordingId(config.audioRecordingId || "");
                setEndCallReason(config.endCallReason ?? false);
                setEndCallReasonDescription(config.endCallReasonDescription || "");
            } else {
                setEndCallMessageType("none");
                setCustomMessage("");
                setAudioRecordingId("");
                setEndCallReason(false);
                setEndCallReasonDescription("");
            }
        } else if (tool.category === "transfer_call") {
            const config = tool.definition?.config as APITransferCallConfig | undefined;
            if (config) {
                setTransferDestination(config.destination || "");
                setTransferMessageType(config.messageType || "none");
                setCustomMessage(config.customMessage || "");
                setTransferAudioRecordingId(config.audioRecordingId || "");
                setTransferTimeout(config.timeout ?? 30);
            } else {
                setTransferDestination("");
                setTransferMessageType("none");
                setCustomMessage("");
                setTransferAudioRecordingId("");
                setTransferTimeout(30);
            }
        } else if (tool.category === "mcp") {
            const config = tool.definition?.config as
                | { url?: string; credential_uuid?: string | null; tools_filter?: string[] }
                | undefined;
            if (config) {
                setMcpUrl(config.url || "");
                setMcpCredentialUuid(config.credential_uuid || "");
                setMcpToolsFilter(
                    Array.isArray(config.tools_filter)
                        ? config.tools_filter.join(", ")
                        : ""
                );
            } else {
                setMcpUrl("");
                setMcpCredentialUuid("");
                setMcpToolsFilter("");
            }
        } else {
            const config = tool.definition?.config as HttpApiToolDefinition["config"] | undefined;
            if (config) {
                setHttpMethod((config.method as HttpMethod) || "POST");
                setUrl(config.url || "");
                setCredentialUuid(config.credential_uuid || "");
                setTimeoutMs(config.timeout_ms || 5000);
                setCustomMessage(config.customMessage || "");
                setCustomMessageType(config.customMessageType || "text");
                setCustomMessageRecordingId(config.customMessageRecordingId || "");

                if (config.headers) {
                    setHeaders(
                        Object.entries(config.headers).map(([key, value]) => ({
                            key,
                            value: value as string,
                        }))
                    );
                } else {
                    setHeaders([]);
                }

                if (config.parameters && Array.isArray(config.parameters)) {
                    setParameters(
                        config.parameters.map((p) => ({
                            name: p.name || "",
                            type: normalizeParameterType(p.type),
                            description: p.description || "",
                            required: p.required ?? true,
                        }))
                    );
                } else {
                    setParameters([]);
                }

                if (config.preset_parameters && Array.isArray(config.preset_parameters)) {
                    setPresetParameters(
                        config.preset_parameters.map((p) => ({
                            name: p.name || "",
                            type: normalizeParameterType(p.type),
                            valueTemplate: p.value_template || "",
                            required: p.required ?? true,
                        }))
                    );
                } else {
                    setPresetParameters([]);
                }
            }
        }
    };

    /** Returns an error message, or null when the form is valid for `category`. */
    const validate = (category: string): string | null => {
        if (category === "calculator") {
            return null;
        }
        if (category === "transfer_call") {
            const e164Pattern = /^\+[1-9]\d{1,14}$/;
            const sipPattern = /^(PJSIP|SIP)\/[\w\-\.@]+$/i;
            const isValidE164 = e164Pattern.test(transferDestination);
            const isValidSip = sipPattern.test(transferDestination);

            if (!transferDestination || (!isValidE164 && !isValidSip)) {
                return "Please enter a valid phone number (E.164 format) or SIP endpoint (e.g., PJSIP/1234)";
            }
            return null;
        }
        if (category === "mcp") {
            if (!mcpUrl.trim()) {
                return "Please enter the MCP server URL";
            }
            if (!MCP_URL_PATTERN.test(mcpUrl.trim())) {
                return "MCP server URL must start with http:// or https://";
            }
            return null;
        }
        if (category !== "end_call") {
            const urlValidation = validateUrl(url);
            if (!urlValidation.valid) {
                return urlValidation.error || "Invalid URL";
            }

            const invalidParams = parameters.filter((p) => !p.name.trim());
            if (invalidParams.length > 0) {
                return "All parameters must have a name";
            }

            const invalidPresetParams = presetParameters.filter(
                (p) => !p.name.trim() || !p.valueTemplate.trim()
            );
            if (invalidPresetParams.length > 0) {
                return "All preset parameters must have a name and a value";
            }
        }
        return null;
    };

    /** Build the typed definition payload for `category` from current form state. */
    const buildDefinition = (category: string): ToolDefinitionPayload => {
        if (category === "calculator") {
            return {
                schema_version: 1,
                type: "calculator",
            };
        }
        if (category === "end_call") {
            return {
                schema_version: 1,
                type: "end_call",
                config: {
                    messageType: endCallMessageType,
                    customMessage: endCallMessageType === "custom" ? customMessage : undefined,
                    audioRecordingId: endCallMessageType === "audio" ? audioRecordingId || undefined : undefined,
                    endCallReason,
                    endCallReasonDescription: endCallReason ? endCallReasonDescription || undefined : undefined,
                },
            };
        }
        if (category === "transfer_call") {
            return {
                schema_version: 1,
                type: "transfer_call",
                config: {
                    destination: transferDestination,
                    messageType: transferMessageType,
                    customMessage: transferMessageType === "custom" ? customMessage : undefined,
                    audioRecordingId: transferMessageType === "audio" ? transferAudioRecordingId || undefined : undefined,
                    timeout: transferTimeout,
                },
            };
        }
        if (category === "mcp") {
            return createMcpDefinition(mcpUrl, mcpCredentialUuid, mcpToolsFilter);
        }

        // HTTP API
        const headersObject: Record<string, string> = {};
        headers.filter((h) => h.key && h.value).forEach((h) => {
            headersObject[h.key] = h.value;
        });

        const validParameters = parameters.filter((p) => p.name.trim());
        const validPresetParameters = presetParameters.filter(
            (p) => p.name.trim() && p.valueTemplate.trim()
        );

        return {
            schema_version: 1,
            type: "http_api",
            config: {
                method: httpMethod,
                url,
                credential_uuid: credentialUuid || undefined,
                headers:
                    Object.keys(headersObject).length > 0
                        ? headersObject
                        : undefined,
                parameters:
                    validParameters.length > 0 ? validParameters : undefined,
                preset_parameters:
                    validPresetParameters.length > 0
                        ? validPresetParameters.map((p) => ({
                            name: p.name,
                            type: p.type,
                            value_template: p.valueTemplate,
                            required: p.required,
                        }))
                        : undefined,
                timeout_ms: timeoutMs,
                customMessage: customMessageType === 'text' ? (customMessage || undefined) : undefined,
                customMessageType,
                customMessageRecordingId: customMessageType === 'audio' ? (customMessageRecordingId || undefined) : undefined,
            },
        };
    };

    return {
        // common
        name, setName,
        description, setDescription,
        customMessage, setCustomMessage,
        // http api
        httpMethod, setHttpMethod,
        url, setUrl,
        credentialUuid, setCredentialUuid,
        headers, setHeaders,
        parameters, setParameters,
        presetParameters, setPresetParameters,
        timeoutMs, setTimeoutMs,
        customMessageType, setCustomMessageType,
        customMessageRecordingId, setCustomMessageRecordingId,
        // end call
        endCallMessageType, setEndCallMessageType,
        endCallReason,
        handleEndCallReasonChange,
        endCallReasonDescription, setEndCallReasonDescription,
        audioRecordingId, setAudioRecordingId,
        // transfer call
        transferDestination, setTransferDestination,
        transferMessageType, setTransferMessageType,
        transferTimeout, setTransferTimeout,
        transferAudioRecordingId, setTransferAudioRecordingId,
        // mcp
        mcpUrl, setMcpUrl,
        mcpCredentialUuid, setMcpCredentialUuid,
        mcpToolsFilter, setMcpToolsFilter,
        // logic
        populateFromTool,
        validate,
        buildDefinition,
    };
}

export type ToolConfigForm = ReturnType<typeof useToolConfigForm>;

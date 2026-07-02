"use client";

import type { RecordingResponseSchema } from "@/client/types.gen";

import { BuiltinToolConfig } from "./BuiltinToolConfig";
import { EndCallToolConfig } from "./EndCallToolConfig";
import { HttpApiToolConfig } from "./HttpApiToolConfig";
import { McpToolConfigFields } from "./McpToolConfigFields";
import { TransferCallToolConfig } from "./TransferCallToolConfig";
import type { ToolConfigForm } from "./useToolConfigForm";

export interface ToolConfigFieldsProps {
    category: string;
    form: ToolConfigForm;
    recordings: RecordingResponseSchema[];
}

/**
 * Per-category tool configuration form (dispatcher). Renders the right config
 * card for `category`, wired to a `useToolConfigForm()` instance. Used by the
 * /tools detail page and the agent editor's inline tool sheet.
 */
export function ToolConfigFields({ category, form, recordings }: ToolConfigFieldsProps) {
    if (category === "calculator") {
        return (
            <BuiltinToolConfig
                name={form.name}
                onNameChange={form.setName}
                description={form.description}
                onDescriptionChange={form.setDescription}
                title="Calculator Configuration"
                subtitle="Built-in calculator for arithmetic operations. No additional configuration needed."
            />
        );
    }
    if (category === "end_call") {
        return (
            <EndCallToolConfig
                name={form.name}
                onNameChange={form.setName}
                description={form.description}
                onDescriptionChange={form.setDescription}
                messageType={form.endCallMessageType}
                onMessageTypeChange={form.setEndCallMessageType}
                customMessage={form.customMessage}
                onCustomMessageChange={form.setCustomMessage}
                audioRecordingId={form.audioRecordingId}
                onAudioRecordingIdChange={form.setAudioRecordingId}
                recordings={recordings}
                endCallReason={form.endCallReason}
                onEndCallReasonChange={form.handleEndCallReasonChange}
                endCallReasonDescription={form.endCallReasonDescription}
                onEndCallReasonDescriptionChange={form.setEndCallReasonDescription}
            />
        );
    }
    if (category === "transfer_call") {
        return (
            <TransferCallToolConfig
                name={form.name}
                onNameChange={form.setName}
                description={form.description}
                onDescriptionChange={form.setDescription}
                destination={form.transferDestination}
                onDestinationChange={form.setTransferDestination}
                messageType={form.transferMessageType}
                onMessageTypeChange={form.setTransferMessageType}
                customMessage={form.customMessage}
                onCustomMessageChange={form.setCustomMessage}
                audioRecordingId={form.transferAudioRecordingId}
                onAudioRecordingIdChange={form.setTransferAudioRecordingId}
                recordings={recordings}
                timeout={form.transferTimeout}
                onTimeoutChange={form.setTransferTimeout}
            />
        );
    }
    if (category === "mcp") {
        return (
            <McpToolConfigFields
                name={form.name}
                onNameChange={form.setName}
                description={form.description}
                onDescriptionChange={form.setDescription}
                url={form.mcpUrl}
                onUrlChange={form.setMcpUrl}
                credentialUuid={form.mcpCredentialUuid}
                onCredentialUuidChange={form.setMcpCredentialUuid}
                toolsFilter={form.mcpToolsFilter}
                onToolsFilterChange={form.setMcpToolsFilter}
            />
        );
    }
    return (
        <HttpApiToolConfig
            name={form.name}
            onNameChange={form.setName}
            description={form.description}
            onDescriptionChange={form.setDescription}
            httpMethod={form.httpMethod}
            onHttpMethodChange={form.setHttpMethod}
            url={form.url}
            onUrlChange={form.setUrl}
            credentialUuid={form.credentialUuid}
            onCredentialUuidChange={form.setCredentialUuid}
            headers={form.headers}
            onHeadersChange={form.setHeaders}
            parameters={form.parameters}
            onParametersChange={form.setParameters}
            presetParameters={form.presetParameters}
            onPresetParametersChange={form.setPresetParameters}
            timeoutMs={form.timeoutMs}
            onTimeoutMsChange={form.setTimeoutMs}
            requestFormat={form.requestFormat}
            onRequestFormatChange={form.setRequestFormat}
            customMessage={form.customMessage}
            onCustomMessageChange={form.setCustomMessage}
            customMessageType={form.customMessageType}
            onCustomMessageTypeChange={form.setCustomMessageType}
            customMessageRecordingId={form.customMessageRecordingId}
            onCustomMessageRecordingIdChange={form.setCustomMessageRecordingId}
            recordings={recordings}
        />
    );
}

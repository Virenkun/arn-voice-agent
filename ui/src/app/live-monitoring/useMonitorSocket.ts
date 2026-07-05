"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { client } from "@/client/client.gen";
import type { RealtimeFeedbackEvent } from "@/components/workflow/conversation";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";
import logger from "@/lib/logger";

// Binary PCM chunk framing — must match api/services/monitoring/monitor_protocol.py
// magic 'D''G' | sample_rate uint32 LE | channels uint16 LE | seq uint32 LE
const PCM_HEADER_SIZE = 12;
const MAGIC_D = 0x44;
const MAGIC_G = 0x47;

export type MonitorConnectionStatus =
    | "idle"
    | "connecting"
    | "connected"
    | "error";

export type SupervisorMode = "barge" | "whisper";

interface UseMonitorSocketOptions {
    workflowRunId: number | null;
    enabled: boolean;
}

function parsePcmChunk(buf: ArrayBuffer) {
    if (buf.byteLength <= PCM_HEADER_SIZE) return null;
    const view = new DataView(buf);
    if (view.getUint8(0) !== MAGIC_D || view.getUint8(1) !== MAGIC_G) return null;
    const sampleRate = view.getUint32(2, true);
    const channels = view.getUint16(6, true);
    const pcm = new Int16Array(buf, PCM_HEADER_SIZE, (buf.byteLength - PCM_HEADER_SIZE) / 2);
    return { sampleRate, channels, pcm };
}

function packPcmChunk(
    pcm: Int16Array,
    sampleRate: number,
    channels: number,
    seq: number,
): ArrayBuffer {
    const out = new ArrayBuffer(PCM_HEADER_SIZE + pcm.byteLength);
    const view = new DataView(out);
    view.setUint8(0, MAGIC_D);
    view.setUint8(1, MAGIC_G);
    view.setUint32(2, sampleRate, true);
    view.setUint16(6, channels, true);
    view.setUint32(8, seq, true);
    new Int16Array(out, PCM_HEADER_SIZE).set(pcm);
    return out;
}

/**
 * Connects to the live-monitoring WebSocket for a run: plays the call's mixed
 * audio, exposes the streamed transcript events, and (Phase 2) relays
 * supervisor barge-in / whisper / text-steer back to the call.
 */
export function useMonitorSocket({ workflowRunId, enabled }: UseMonitorSocketOptions) {
    const { getAccessToken } = useAuth();

    const [status, setStatus] = useState<MonitorConnectionStatus>("idle");
    const [events, setEvents] = useState<RealtimeFeedbackEvent[]>([]);
    const [speaker, setSpeaker] = useState<"bot" | "user" | null>(null);
    const [listening, setListening] = useState(false);
    const [bargeInActive, setBargeInActive] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const listeningRef = useRef(false);
    const playbackCtxRef = useRef<AudioContext | null>(null);
    const gainRef = useRef<GainNode | null>(null);
    const nextStartTimeRef = useRef(0);

    // Supervisor mic (barge-in) state
    const micCtxRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const micNodeRef = useRef<AudioWorkletNode | null>(null);
    const seqRef = useRef(0);

    const sendControl = useCallback((message: Record<string, unknown>) => {
        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }, []);

    const stopBargeInInternal = useCallback(() => {
        if (micNodeRef.current) {
            micNodeRef.current.port.onmessage = null;
            micNodeRef.current.disconnect();
            micNodeRef.current = null;
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach((t) => t.stop());
            micStreamRef.current = null;
        }
        if (micCtxRef.current) {
            void micCtxRef.current.close();
            micCtxRef.current = null;
        }
    }, []);

    const ensurePlaybackContext = useCallback(() => {
        if (!playbackCtxRef.current) {
            const ctx = new AudioContext();
            const gain = ctx.createGain();
            gain.gain.value = 1;
            gain.connect(ctx.destination);
            playbackCtxRef.current = ctx;
            gainRef.current = gain;
            nextStartTimeRef.current = 0;
        }
        return playbackCtxRef.current;
    }, []);

    const playPcm = useCallback(
        (pcm: Int16Array, sampleRate: number) => {
            const ctx = ensurePlaybackContext();
            if (!ctx || !gainRef.current) return;
            if (ctx.state === "suspended") void ctx.resume();

            const frames = pcm.length;
            if (frames === 0) return;
            const audioBuffer = ctx.createBuffer(1, frames, sampleRate);
            const channel = audioBuffer.getChannelData(0);
            for (let i = 0; i < frames; i++) {
                channel[i] = pcm[i] / 32768;
            }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(gainRef.current);

            const now = ctx.currentTime;
            // Minimal jitter buffer to keep latency low; if we've fallen behind
            // (underrun), resync just ahead of the clock.
            if (nextStartTimeRef.current < now + 0.02) {
                nextStartTimeRef.current = now + 0.05;
            }
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
        },
        [ensurePlaybackContext],
    );

    const handleEvent = useCallback((event: RealtimeFeedbackEvent) => {
        if (event.type === "rtf-bot-started-speaking") {
            setSpeaker("bot");
            return;
        }
        if (event.type === "rtf-bot-stopped-speaking") {
            setSpeaker((s) => (s === "bot" ? null : s));
            return;
        }
        if (event.type === "rtf-user-transcription" && event.payload?.final === false) {
            setSpeaker("user");
        }
        // Accumulate everything the transcript adapter understands (it ignores
        // the speaking/mute control events above harmlessly).
        setEvents((prev) => {
            const next = [...prev, event];
            return next.length > 1000 ? next.slice(next.length - 1000) : next;
        });
    }, []);

    // --- Connection lifecycle ------------------------------------------------
    useEffect(() => {
        if (!enabled || !workflowRunId) return;

        let cancelled = false;
        setStatus("connecting");
        setEvents([]);

        (async () => {
            let token: string;
            try {
                token = await getAccessToken();
            } catch (e) {
                logger.error("monitor: failed to get access token", e);
                if (!cancelled) setStatus("error");
                return;
            }
            if (cancelled) return;

            const baseUrl = client.getConfig().baseUrl || resolveBrowserBackendUrl();
            const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/v1/monitoring/ws/${workflowRunId}?token=${token}`;
            const ws = new WebSocket(wsUrl);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                if (!cancelled) setStatus("connected");
            };
            ws.onmessage = (evt) => {
                if (typeof evt.data === "string") {
                    try {
                        const event = JSON.parse(evt.data) as RealtimeFeedbackEvent;
                        // Stamp a client receive time so the timeline can order/label it.
                        if (!event.timestamp) event.timestamp = new Date().toISOString();
                        handleEvent(event);
                    } catch (e) {
                        logger.debug("monitor: bad event json", e);
                    }
                } else if (evt.data instanceof ArrayBuffer && listeningRef.current) {
                    const chunk = parsePcmChunk(evt.data);
                    if (chunk) playPcm(chunk.pcm, chunk.sampleRate);
                }
            };
            ws.onerror = (e) => {
                logger.error("monitor: websocket error", e);
                if (!cancelled) setStatus("error");
            };
            ws.onclose = () => {
                if (!cancelled) setStatus("idle");
            };
        })();

        return () => {
            cancelled = true;
            const ws = wsRef.current;
            if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
            wsRef.current = null;
            // Tear down mic + playback.
            stopBargeInInternal();
            if (playbackCtxRef.current) {
                void playbackCtxRef.current.close();
                playbackCtxRef.current = null;
                gainRef.current = null;
            }
            setStatus("idle");
            setSpeaker(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, workflowRunId]);

    // --- Listen controls -----------------------------------------------------
    // Audio is opt-in: the call is only streamed (and only published over Redis)
    // once the supervisor explicitly starts listening. Creating/resuming the
    // AudioContext here runs inside the click handler, satisfying autoplay policy.
    const startListening = useCallback(() => {
        const ctx = ensurePlaybackContext();
        if (ctx?.state === "suspended") void ctx.resume();
        nextStartTimeRef.current = 0;
        listeningRef.current = true;
        setListening(true);
        sendControl({ type: "audio_start" });
    }, [ensurePlaybackContext, sendControl]);

    const stopListening = useCallback(() => {
        listeningRef.current = false;
        setListening(false);
        sendControl({ type: "audio_stop" });
    }, [sendControl]);

    // --- Supervisor controls (Phase 2) --------------------------------------
    const startMicStreaming = useCallback(async () => {
        if (micNodeRef.current) return; // already streaming
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
        });
        micStreamRef.current = stream;
        const ctx = new AudioContext();
        micCtxRef.current = ctx;
        await ctx.audioWorklet.addModule("/pcm-recorder-worklet.js");
        const sourceNode = ctx.createMediaStreamSource(stream);
        const worklet = new AudioWorkletNode(ctx, "pcm-recorder");
        micNodeRef.current = worklet;
        const sampleRate = ctx.sampleRate;
        worklet.port.onmessage = (evt) => {
            const floats = evt.data as Float32Array;
            const pcm = new Int16Array(floats.length);
            for (let i = 0; i < floats.length; i++) {
                const s = Math.max(-1, Math.min(1, floats[i]));
                pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
                seqRef.current += 1;
                ws.send(packPcmChunk(pcm, sampleRate, 1, seqRef.current));
            }
        };
        sourceNode.connect(worklet);
        // Worklet has no output; connect to a muted gain to keep it pulling.
        const sink = ctx.createGain();
        sink.gain.value = 0;
        worklet.connect(sink);
        sink.connect(ctx.destination);
    }, []);

    const startBargeIn = useCallback(async () => {
        try {
            await startMicStreaming();
            sendControl({ type: "barge_in_start" });
            setBargeInActive(true);
        } catch (e) {
            logger.error("monitor: failed to start barge-in", e);
        }
    }, [sendControl, startMicStreaming]);

    const stopBargeIn = useCallback(() => {
        sendControl({ type: "barge_in_stop" });
        stopBargeInInternal();
        setBargeInActive(false);
    }, [sendControl, stopBargeInInternal]);

    const steerText = useCallback(
        (text: string, runLlm = false) => {
            const trimmed = text.trim();
            if (!trimmed) return;
            sendControl({ type: "steer_text", text: trimmed, run_llm: runLlm });
        },
        [sendControl],
    );

    return {
        status,
        events,
        speaker,
        listening,
        startListening,
        stopListening,
        bargeInActive,
        startBargeIn,
        stopBargeIn,
        steerText,
    };
}

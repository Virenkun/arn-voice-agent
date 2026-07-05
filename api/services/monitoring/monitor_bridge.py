"""Call-side monitoring bridge.

One instance runs inside the worker that owns a live call. It:

- publishes the call's low-latency mixed PCM (from a dedicated
  ``AudioBufferProcessor`` tap) and transcript events to Redis, but only while
  at least one monitor is attached (so an unwatched call costs nothing);
- consumes monitor control messages and supervisor microphone audio from Redis
  and drives the pipeline's :class:`SupervisorControlProcessor` (Phase 2).

Presence is tracked from ``attach``/``detach`` control messages, with a
periodic reconcile against each monitor's Redis presence key so a monitor that
crashes without sending ``detach`` is eventually dropped and audio publishing
stops.
"""

import asyncio
import json
from typing import Optional

import redis.asyncio as aioredis
from loguru import logger

from api.constants import REDIS_URL
from api.services.monitoring.monitor_protocol import (
    MonitorControl,
    MonitorRedisChannels,
    pack_pcm_chunk,
    unpack_pcm_chunk,
)

# How often to drop presence-expired monitors. Must be safely below the
# monitor's presence TTL so a live listener is never reconciled away.
_RECONCILE_INTERVAL_SECONDS = 10.0


class MonitorBridge:
    """Bridges one live call to any monitors listening over Redis."""

    def __init__(self, workflow_run_id: int, audio_config):
        self._run_id = workflow_run_id
        self._audio_config = audio_config
        self._monitor_tap = None
        self._supervisor = None

        self._monitors: set[str] = set()
        self._recording = False
        self._seq = 0

        self._redis: Optional[aioredis.Redis] = None
        self._sub_redis: Optional[aioredis.Redis] = None
        self._pubsub = None
        self._listen_task: Optional[asyncio.Task] = None
        self._reconcile_task: Optional[asyncio.Task] = None

        self._audio_down = MonitorRedisChannels.audio_down(workflow_run_id)
        self._events_down = MonitorRedisChannels.events_down(workflow_run_id)
        self._control_up = MonitorRedisChannels.control_up(workflow_run_id)
        self._audio_up = MonitorRedisChannels.audio_up(workflow_run_id)
        self._control_up_b = self._control_up.encode()
        self._audio_up_b = self._audio_up.encode()

    @property
    def monitors_present(self) -> bool:
        return bool(self._monitors)

    def attach_pipeline(self, monitor_tap, supervisor_processor=None) -> None:
        """Wire the pipeline's monitor tap (and supervisor processor) in.

        Called once the pipeline components exist, before ``start()``.
        """
        self._monitor_tap = monitor_tap
        self._supervisor = supervisor_processor

    async def start(self) -> None:
        """Open Redis connections and start listening for monitors."""
        self._redis = aioredis.from_url(REDIS_URL, decode_responses=False)
        self._sub_redis = aioredis.from_url(REDIS_URL, decode_responses=False)
        self._pubsub = self._sub_redis.pubsub()

        channels = [self._control_up]
        if self._supervisor is not None:
            channels.append(self._audio_up)
        await self._pubsub.subscribe(*channels)

        self._listen_task = asyncio.create_task(self._listen_loop())
        self._reconcile_task = asyncio.create_task(self._reconcile_loop())
        logger.debug(f"[monitor {self._run_id}] bridge started")

    async def stop(self) -> None:
        """Cancel tasks, stop the tap, and close Redis connections."""
        for task in (self._listen_task, self._reconcile_task):
            if task is not None:
                task.cancel()
        for task in (self._listen_task, self._reconcile_task):
            if task is not None:
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

        if self._recording:
            try:
                await self._monitor_tap.stop_recording()
            except Exception as e:
                logger.debug(f"[monitor {self._run_id}] stop_recording failed: {e}")
            self._recording = False

        try:
            if self._pubsub is not None:
                await self._pubsub.unsubscribe()
                await self._pubsub.aclose()
        except Exception as e:
            logger.debug(f"[monitor {self._run_id}] pubsub close failed: {e}")
        for client in (self._redis, self._sub_redis):
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass
        logger.debug(f"[monitor {self._run_id}] bridge stopped")

    # --- Downstream (call -> monitor) ---------------------------------------

    async def on_tap_audio(self, _buffer, audio, sample_rate, num_channels) -> None:
        """AudioBufferProcessor ``on_audio_data`` handler for the monitor tap."""
        if not self.monitors_present or not audio or self._redis is None:
            return
        self._seq += 1
        chunk = pack_pcm_chunk(audio, sample_rate, num_channels, self._seq)
        try:
            await self._redis.publish(self._audio_down, chunk)
        except Exception as e:
            logger.debug(f"[monitor {self._run_id}] audio publish failed: {e}")

    async def publish_event(self, event: dict) -> None:
        """Publish a transcript/feedback event to attached monitors."""
        if not self.monitors_present or self._redis is None:
            return
        try:
            await self._redis.publish(self._events_down, json.dumps(event).encode())
        except Exception as e:
            logger.debug(f"[monitor {self._run_id}] event publish failed: {e}")

    # --- Upstream (monitor -> call) -----------------------------------------

    async def _listen_loop(self) -> None:
        try:
            async for message in self._pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    channel = message["channel"]
                    data = message["data"]
                    if channel == self._control_up_b:
                        await self._handle_control(json.loads(data.decode()))
                    elif channel == self._audio_up_b:
                        await self._handle_mic_audio(data)
                except Exception as e:
                    logger.debug(f"[monitor {self._run_id}] bad monitor message: {e}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"[monitor {self._run_id}] listen loop ended: {e}")

    async def _handle_control(self, msg: dict) -> None:
        msg_type = msg.get("type")
        monitor_id = msg.get("monitor_id")

        if msg_type == MonitorControl.ATTACH and monitor_id:
            self._monitors.add(monitor_id)
            await self._sync_recording()
            return
        if msg_type == MonitorControl.DETACH and monitor_id:
            self._monitors.discard(monitor_id)
            await self._sync_recording()
            return

        if self._supervisor is None:
            return

        if msg_type == MonitorControl.BARGE_IN_START:
            await self._supervisor.start_barge_in()
        elif msg_type == MonitorControl.BARGE_IN_STOP:
            await self._supervisor.stop_barge_in()
        elif msg_type == MonitorControl.SET_MODE:
            self._supervisor.set_mode(msg.get("mode", "barge"))
        elif msg_type == MonitorControl.STEER_TEXT:
            await self._supervisor.inject_guidance(
                msg.get("text", ""), run_llm=bool(msg.get("run_llm", False))
            )

    async def _handle_mic_audio(self, data: bytes) -> None:
        if self._supervisor is None:
            return
        pcm, sample_rate, _channels, _seq = unpack_pcm_chunk(data)
        await self._supervisor.push_supervisor_audio(pcm, sample_rate)

    # --- Presence / tap gating ----------------------------------------------

    async def _sync_recording(self) -> None:
        if self._monitor_tap is None:
            return
        present = self.monitors_present
        if present and not self._recording:
            await self._monitor_tap.start_recording()
            self._recording = True
            logger.info(f"[monitor {self._run_id}] tap recording started")
        elif not present and self._recording:
            await self._monitor_tap.stop_recording()
            self._recording = False
            logger.info(f"[monitor {self._run_id}] tap recording stopped (no listeners)")

    async def _reconcile_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(_RECONCILE_INTERVAL_SECONDS)
                if not self._monitors or self._redis is None:
                    continue
                stale = []
                for monitor_id in list(self._monitors):
                    key = MonitorRedisChannels.presence_key(self._run_id, monitor_id)
                    try:
                        exists = await self._redis.exists(key)
                    except Exception:
                        exists = 1  # be lenient on transient Redis errors
                    if not exists:
                        stale.append(monitor_id)
                for monitor_id in stale:
                    self._monitors.discard(monitor_id)
                if stale:
                    logger.info(
                        f"[monitor {self._run_id}] reconciled {len(stale)} stale monitor(s)"
                    )
                    await self._sync_recording()
        except asyncio.CancelledError:
            raise


def compose_monitor_sender(ws_sender, bridge: "MonitorBridge"):
    """Wrap the call's WebSocket sender so events also reach live monitors.

    ``ws_sender`` is the existing per-run signaling-socket sender (``None`` for
    telephony calls, which have no controlling browser). The returned callable
    forwards each event to it (when present) and to the monitor bridge, which
    republishes to any attached listeners over Redis.
    """

    async def send(message: dict) -> None:
        if ws_sender is not None:
            try:
                await ws_sender(message)
            except Exception as e:
                logger.debug(f"ws_sender failed: {e}")
        await bridge.publish_event(message)

    return send

"""Monitor-side session.

One instance per browser WebSocket connection. It bridges the browser to the
call worker over Redis (the call may run on a different worker): it forwards
downstream call audio + transcript events to the browser, forwards the
browser's supervisor control + microphone audio upstream, and keeps a
short-TTL presence key alive so the call-side bridge knows a listener is here.
"""

import asyncio
import json
import uuid

import redis.asyncio as aioredis
from fastapi import WebSocket
from loguru import logger

from api.constants import REDIS_URL
from api.services.monitoring.monitor_protocol import (
    MONITOR_SNAPSHOT_EVENT,
    MonitorControl,
    MonitorRedisChannels,
)

# Presence key TTL and refresh cadence. TTL must exceed the refresh interval by
# enough margin that a live listener's key never lapses between refreshes.
_PRESENCE_TTL_SECONDS = 15
_PRESENCE_REFRESH_SECONDS = 5


class MonitorSession:
    """Streams one live call to a browser and relays its supervisor controls."""

    def __init__(self, workflow_run_id: int, user):
        self._run_id = workflow_run_id
        self._user = user
        self._monitor_id = uuid.uuid4().hex

        self._audio_down = MonitorRedisChannels.audio_down(workflow_run_id)
        self._events_down = MonitorRedisChannels.events_down(workflow_run_id)
        self._audio_down_b = self._audio_down.encode()
        self._events_down_b = self._events_down.encode()
        self._control_up = MonitorRedisChannels.control_up(workflow_run_id)
        self._audio_up = MonitorRedisChannels.audio_up(workflow_run_id)
        self._presence_key = MonitorRedisChannels.presence_key(
            workflow_run_id, self._monitor_id
        )

        self._redis: aioredis.Redis | None = None
        self._sub_redis: aioredis.Redis | None = None
        self._pubsub = None

    async def run(self, websocket: WebSocket) -> None:
        """Run the session until the browser disconnects."""
        self._redis = aioredis.from_url(REDIS_URL, decode_responses=False)
        self._sub_redis = aioredis.from_url(REDIS_URL, decode_responses=False)
        self._pubsub = self._sub_redis.pubsub()
        await self._pubsub.subscribe(self._events_down, self._audio_down)

        # Announce presence (key first, so the call-side reconcile never drops
        # us before we've registered), then attach.
        await self._refresh_presence()
        await self._publish_control({"type": MonitorControl.ATTACH})
        logger.info(
            f"[monitor {self._run_id}] listener {self._monitor_id} attached "
            f"(user={self._user.id})"
        )

        tasks = [
            asyncio.create_task(self._downstream(websocket)),
            asyncio.create_task(self._upstream(websocket)),
            asyncio.create_task(self._presence_loop()),
        ]
        try:
            _done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        finally:
            await self._cleanup()

    async def _downstream(self, websocket: WebSocket) -> None:
        """Relay Redis downstream (audio + events) to the browser."""
        async for message in self._pubsub.listen():
            if message.get("type") != "message":
                continue
            channel = message["channel"]
            data = message["data"]
            try:
                if channel == self._audio_down_b:
                    await websocket.send_bytes(data)
                elif channel == self._events_down_b:
                    obj = json.loads(data.decode())
                    # Backlog snapshots are addressed to one monitor; every
                    # session sees the broadcast, so drop snapshots meant for
                    # someone else.
                    if (
                        obj.get("type") == MONITOR_SNAPSHOT_EVENT
                        and obj.get("monitor_id") != self._monitor_id
                    ):
                        continue
                    await websocket.send_json(obj)
            except Exception as e:
                logger.debug(f"[monitor {self._run_id}] downstream send failed: {e}")
                return

    async def _upstream(self, websocket: WebSocket) -> None:
        """Relay the browser's control + mic audio upstream to the call."""
        while True:
            message = await websocket.receive()
            msg_type = message.get("type")
            if msg_type == "websocket.disconnect":
                return
            text = message.get("text")
            data = message.get("bytes")
            if text is not None:
                try:
                    control = json.loads(text)
                except Exception:
                    continue
                await self._publish_control(control)
            elif data is not None:
                # Supervisor microphone PCM (barge-in / whisper).
                try:
                    await self._redis.publish(self._audio_up, data)
                except Exception as e:
                    logger.debug(f"[monitor {self._run_id}] mic publish failed: {e}")

    async def _presence_loop(self) -> None:
        while True:
            await asyncio.sleep(_PRESENCE_REFRESH_SECONDS)
            await self._refresh_presence()

    async def _refresh_presence(self) -> None:
        try:
            await self._redis.setex(self._presence_key, _PRESENCE_TTL_SECONDS, b"1")
        except Exception as e:
            logger.debug(f"[monitor {self._run_id}] presence refresh failed: {e}")

    async def _publish_control(self, control: dict) -> None:
        control = {**control, "monitor_id": self._monitor_id}
        try:
            await self._redis.publish(self._control_up, json.dumps(control).encode())
        except Exception as e:
            logger.debug(f"[monitor {self._run_id}] control publish failed: {e}")

    async def _cleanup(self) -> None:
        try:
            await self._publish_control({"type": MonitorControl.DETACH})
        except Exception:
            pass
        try:
            await self._redis.delete(self._presence_key)
        except Exception:
            pass
        try:
            if self._pubsub is not None:
                await self._pubsub.unsubscribe()
                await self._pubsub.aclose()
        except Exception:
            pass
        for client in (self._redis, self._sub_redis):
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass
        logger.info(
            f"[monitor {self._run_id}] listener {self._monitor_id} detached"
        )

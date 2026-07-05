"""Redis communication protocol for live call monitoring.

Defines the Redis channel/key names and the binary PCM chunk framing used to
bridge a monitor's browser (which may be served by any uvicorn worker) to the
worker actually running the call. Everything is keyed by ``workflow_run_id``.

Channel directions (from the call's point of view):

- ``audio_down`` / ``events_down`` — call -> monitor (mixed PCM, transcript events)
- ``control_up`` / ``audio_up``   — monitor -> call (supervisor control, mic PCM)

``presence_key`` is a short-TTL per-monitor key the monitor session refreshes
while connected; the call-side bridge uses it as a crash-safety backstop so it
stops publishing audio when every listener has gone away.
"""

import struct

# Binary PCM chunk header, prepended to every audio frame on the audio_* channels
# so a receiver learns the sample rate without a side channel. Little-endian:
# magic(2s) | sample_rate: uint32 | channels: uint16 | seq: uint32
_HEADER_MAGIC = b"DG"
_HEADER_FORMAT = "<2sIHI"
PCM_HEADER_SIZE = struct.calcsize(_HEADER_FORMAT)  # 12 bytes

# Downstream JSON event carrying the conversation-so-far to a newly-joined
# monitor (targeted at one monitor_id) so it sees the full call, not just what
# happens after it connected.
MONITOR_SNAPSHOT_EVENT = "monitor-snapshot"


class MonitorControl:
    """``type`` values for JSON control messages on the control_up channel."""

    ATTACH = "attach"  # listener connected (transcript flows)
    DETACH = "detach"
    AUDIO_START = "audio_start"  # listener wants to hear the call audio
    AUDIO_STOP = "audio_stop"
    BARGE_IN_START = "barge_in_start"
    BARGE_IN_STOP = "barge_in_stop"
    SET_MODE = "set_mode"  # payload: {"mode": "barge" | "whisper"}
    STEER_TEXT = "steer_text"  # payload: {"text": str, "run_llm": bool}


class MonitorRedisChannels:
    """Redis channel/key naming conventions for live monitoring."""

    @staticmethod
    def audio_down(run_id: int) -> str:
        """Binary channel: mixed call PCM streamed to monitors."""
        return f"monitor:audio:{run_id}"

    @staticmethod
    def events_down(run_id: int) -> str:
        """JSON channel: realtime transcript/feedback events streamed to monitors."""
        return f"monitor:events:{run_id}"

    @staticmethod
    def control_up(run_id: int) -> str:
        """JSON channel: supervisor control messages (attach/detach/barge/steer)."""
        return f"monitor:up:control:{run_id}"

    @staticmethod
    def audio_up(run_id: int) -> str:
        """Binary channel: supervisor microphone PCM (barge-in / whisper)."""
        return f"monitor:up:audio:{run_id}"

    @staticmethod
    def presence_key(run_id: int, monitor_id: str) -> str:
        """Per-monitor presence key (SETEX with a short TTL while connected)."""
        return f"monitor:presence:{run_id}:{monitor_id}"


def pack_pcm_chunk(pcm: bytes, sample_rate: int, channels: int, seq: int) -> bytes:
    """Prepend the self-describing header to a raw 16-bit PCM chunk."""
    header = struct.pack(_HEADER_FORMAT, _HEADER_MAGIC, sample_rate, channels, seq)
    return header + pcm


def unpack_pcm_chunk(data: bytes) -> tuple[bytes, int, int, int]:
    """Split a framed chunk into ``(pcm, sample_rate, channels, seq)``.

    Raises ``ValueError`` if the header is missing or the magic doesn't match.
    """
    if len(data) < PCM_HEADER_SIZE:
        raise ValueError("PCM chunk shorter than header")
    magic, sample_rate, channels, seq = struct.unpack(
        _HEADER_FORMAT, data[:PCM_HEADER_SIZE]
    )
    if magic != _HEADER_MAGIC:
        raise ValueError("Bad PCM chunk magic")
    return data[PCM_HEADER_SIZE:], sample_rate, channels, seq

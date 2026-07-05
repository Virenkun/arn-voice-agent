"""Frames must flow cleanly through the live-monitoring processors.

The SupervisorControlProcessor and the low-latency monitor tap are inserted into
every call's pipeline, so a bug here would break real calls (including the
browser voice test). This drives StartFrame + audio + EndFrame through them.
"""

import pytest

from api.services.pipecat.audio_config import AudioConfig
from api.services.pipecat.pipeline_builder import create_pipeline_components
from api.services.pipecat.supervisor_control_processor import SupervisorControlProcessor
from pipecat.frames.frames import OutputAudioRawFrame
from pipecat.tests.utils import run_test


class _FakeEngine:
    task = None

    def set_mute_pipeline(self, mute):
        pass


def _audio_config():
    return AudioConfig(
        transport_in_sample_rate=16000,
        transport_out_sample_rate=16000,
        vad_sample_rate=16000,
        pipeline_sample_rate=16000,
    )


@pytest.mark.asyncio
async def test_supervisor_processor_passthrough():
    ac = _audio_config()
    proc = SupervisorControlProcessor(_FakeEngine(), ac)
    frame = OutputAudioRawFrame(
        audio=b"\x01\x02" * 160, sample_rate=16000, num_channels=1
    )
    down, _up = await run_test(
        proc,
        frames_to_send=[frame],
        expected_down_frames=[OutputAudioRawFrame],
    )
    assert any(isinstance(f, OutputAudioRawFrame) for f in down)


@pytest.mark.asyncio
async def test_monitor_tap_passthrough_when_idle():
    ac = _audio_config()
    _audio_buffer, monitor_tap, _context = create_pipeline_components(ac)
    frame = OutputAudioRawFrame(
        audio=b"\x01\x02" * 160, sample_rate=16000, num_channels=1
    )
    down, _up = await run_test(
        monitor_tap,
        frames_to_send=[frame],
        expected_down_frames=[OutputAudioRawFrame],
    )
    assert any(isinstance(f, OutputAudioRawFrame) for f in down)

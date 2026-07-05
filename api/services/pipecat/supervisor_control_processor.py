"""Live-monitoring supervisor control processor.

A pipeline processor that lets a monitoring supervisor act on a live call:

- **Barge-in / take over** — the supervisor's microphone audio is injected
  toward the caller (as ``OutputAudioRawFrame``) while the AI bot is
  interrupted and muted, then unmuted when the supervisor releases.
- **Whisper / steer** — a text instruction (typed, or transcribed in the
  browser) is appended to the LLM context so it shapes the AI's next replies
  without the caller hearing it.

It is placed just before ``transport.output()`` so ``broadcast_interruption()``
flushes the output queue and injected audio reaches the caller. All methods are
driven by :class:`MonitorBridge` from the same event loop; the processor itself
only passes frames through untouched.
"""

from loguru import logger

from pipecat.audio.utils import create_stream_resampler
from pipecat.frames.frames import (
    Frame,
    LLMMessagesAppendFrame,
    OutputAudioRawFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


class SupervisorControlProcessor(FrameProcessor):
    """Injects supervisor audio/instructions into a live call."""

    def __init__(self, engine, audio_config, **kwargs):
        super().__init__(**kwargs)
        self._engine = engine
        self._pipeline_sample_rate = audio_config.pipeline_sample_rate
        self._resampler = create_stream_resampler()
        self._barge_in = False
        self._mode = "barge"

    def set_mode(self, mode: str) -> None:
        """Record the active supervisor mode ("barge" or "whisper")."""
        self._mode = mode

    async def start_barge_in(self) -> None:
        """Interrupt and mute the bot so the supervisor can talk to the caller."""
        self._barge_in = True
        # Cancel any in-flight/queued bot turn and flush the output queue.
        await self.broadcast_interruption()
        # Keep the caller's own speech from spawning a new bot turn while the
        # supervisor is speaking (drives the existing CallbackUserMuteStrategy).
        self._engine.set_mute_pipeline(True)
        logger.info("[supervisor] barge-in started")

    async def stop_barge_in(self) -> None:
        """Un-mute the bot after the supervisor releases barge-in."""
        self._barge_in = False
        try:
            # Note the human interjection so the AI stays coherent; run_llm=False
            # leaves the bot silent until the caller speaks again.
            await self.inject_guidance(
                "A human supervisor just spoke to the caller directly. "
                "Continue the conversation naturally from here.",
                run_llm=False,
            )
        finally:
            # Must always run, or the caller stays muted for the rest of the call.
            self._engine.set_mute_pipeline(False)
        logger.info("[supervisor] barge-in stopped")

    async def push_supervisor_audio(self, pcm: bytes, in_sample_rate: int) -> None:
        """Inject the supervisor's mic audio toward the caller (barge-in)."""
        if not pcm:
            return
        resampled = await self._resampler.resample(
            pcm, in_sample_rate, self._pipeline_sample_rate
        )
        if not resampled:
            return
        await self.push_frame(
            OutputAudioRawFrame(
                audio=resampled,
                sample_rate=self._pipeline_sample_rate,
                num_channels=1,
            ),
            FrameDirection.DOWNSTREAM,
        )

    async def inject_guidance(self, text: str, run_llm: bool = False) -> None:
        """Append a supervisor instruction to the LLM context (whisper/steer)."""
        text = (text or "").strip()
        if not text:
            return
        if self._engine.task is None:
            logger.debug("[supervisor] no task on engine; dropping guidance")
            return
        await self._engine.task.queue_frame(
            LLMMessagesAppendFrame(
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "[Supervisor instruction — not heard by the caller]: "
                            f"{text}"
                        ),
                    }
                ],
                run_llm=run_llm,
            )
        )
        logger.info(f"[supervisor] injected guidance (run_llm={run_llm})")

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)

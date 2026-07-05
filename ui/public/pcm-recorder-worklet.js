// Captures microphone audio for live-monitoring barge-in. Accumulates mono
// Float32 samples into ~20ms frames and posts them to the main thread, which
// converts to PCM16 and streams them to the call. See useMonitorSocket.ts.
class PCMRecorder extends AudioWorkletProcessor {
    constructor() {
        super();
        // ~20ms at 48kHz; keeps barge-in latency low without flooding the WS.
        this._frameSize = 1024;
        this._buffer = new Float32Array(this._frameSize);
        this._offset = 0;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;
        const channel = input[0];
        if (!channel) return true;

        for (let i = 0; i < channel.length; i++) {
            this._buffer[this._offset++] = channel[i];
            if (this._offset === this._frameSize) {
                const frame = this._buffer.slice(0);
                this.port.postMessage(frame, [frame.buffer]);
                this._offset = 0;
            }
        }
        return true;
    }
}

registerProcessor("pcm-recorder", PCMRecorder);

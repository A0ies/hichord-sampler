# HiChord Looper

A looper for the HiChord pocket synth, in the spirit of [fm1-sampler](https://github.com/ferluht/fm1-sampler): you play on the HiChord, this app records it in layers and makes the sound, and you change timing, instruments and mix while it loops.

Open it at https://a0ies.github.io/hichord-sampler/ (Chrome or Edge), or use the iPhone app in `ios/`.

## How it works

- **Layers.** Eight layers; whatever you play goes into the selected one. Press record (R), play, press record again. Each pass is a take you can undo.
- **MIDI, not audio.** The app stores the notes you played. That is why timing and instruments stay editable after recording.
- **Timing, live.** Per layer: quantize (1/4 to 1/16 triplets), strength, swing, nudge, note length, humanize, octave. Your original timing is never changed; Quantize Off brings it back. Tempo changes re-time every layer at once.
- **Instruments.** FM keys, soft piano, warm pad, strings, organ, soft lead, sub bass, pluck, glass bell and a drum kit that follows the HiChord's drum pads. Or use your own sound from the microphone or an audio file.
- **Loop.** 1 to 16 bars, ×2 to double, count-in and click.
- **HiChord.** Notes always come in over USB MIDI. Connect HiChord to also see and set its key, scale, octave, play mode and sound, follow its tempo or send yours, and let its start/stop run the loop.
- The session (notes and settings) is kept in the browser between visits; your own sounds are not.

## iPhone app

iOS browsers have no Web MIDI, so `ios/` holds a small app: a full-screen WebView with a CoreMIDI bridge (`MIDIBridge.swift` + `midi-shim.js`). It loads the published page and falls back to the bundled copy offline.

```
cd ios && xcodegen generate && open HiChordSampler.xcodeproj
```
Pick your team under Signing & Capabilities, plug in the iPhone and press Run.

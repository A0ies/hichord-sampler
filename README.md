# HiChord Looper

A looper for the HiChord pocket synth, in the spirit of [fm1-sampler](https://github.com/ferluht/fm1-sampler): you play on the HiChord, this app records it in layers and makes the sound, and you change timing, instruments and mix while it loops.

Open it at https://a0ies.github.io/hichord-sampler/ (Chrome or Edge), or use the iPhone app in `ios/`.

## How it works

- **Layers.** Eight layers; whatever you play goes into the selected one. Press record (R), play, press record again. Each pass is a take you can undo.
- **Capture mode.** Capture (C) turns every layer into a full-screen touch pad, with its icon and a small timeline. Tap a pad to switch the layer on or off; hold and drag to play its effect (low-pass, high-pass, stutter gate, delay throw, reverb wash, pitch bend or drive, chosen per layer under Mix, or by tapping the effect label next to the layer's name). Let go and the effect springs back. At the bottom, a record strip (in place of the transport bar) records what you hear to an audio file, with a timer and level meter; capture mode never records into a layer.
- **MIDI, not audio.** The app stores the notes you played. That is why timing and instruments stay editable after recording.
- **Timing, live.** Per layer: quantize (1/4 to 1/16 triplets), strength, swing, nudge, note length, humanize, octave. Switch from feel to advanced for an XY screen that sets strength (left–right) and humanize (up–down), with the grid, swing, note length and nudge underneath. The layer panel keeps one height on every page, with clear notes and remove layer (tap twice) at the bottom, and above it a preview screen: the layer's timeline with its playhead, and under it a strip with the live waveform, filter curve and envelope, a play key and a solo key. Your original timing is never changed; Quantize Off brings it back. Tempo changes re-time every layer at once.
- **Instruments.** Multisampled in Ableton: grand piano, Rhodes, strings, horns, electric guitar, saw lead, square lead, pad, electric bass, synth bass and drums (the drums follow the HiChord's drum pads). Each lives in `sounds/` as one AAC file with a note every 3 semitones; `sounds/sounds.json` holds where each note and its loop start. Bass and drum layers play single notes: bass plays the chord's root, and on drums every chord key gets its own drum (I kick, II snare, III hat, IV open hat, V tom, VI percussion, VII crash, following the HiChord's key). The HiChord's drum pads on channel 10 can still hit two drums at once. Or use your own sound from the microphone or an audio file.
- **Loop.** 1 to 16 bars, ×2 to double, count-in and click.
- **Note editor (piano roll).** Works on whole chords by default (with chord names), or on single notes. Like in Ableton: double-click/double-tap to add, drag to move in time and pitch, drag an edge to lengthen or shorten, drag empty space to select, Alt-drag to copy, a velocity lane, snap from 1/4 to 1/32, quantize, duplicate, undo/redo and keyboard shortcuts (⌫, ⌘D, ⌘A, ⌘Z, arrows, Q, B). On a phone: one finger pans, two fingers zoom, Draw adds with a single tap.
- **HiChord.** Notes always come in over USB MIDI. Connect HiChord to also see and set its key, scale, octave, play mode and sound, follow its tempo or send yours, and let its start/stop run the loop.
- **Projects.** Every session is a project that saves itself (IndexedDB), including your own sounds. A new project is named after its creation date and time ("11 Nov 2026 · 14:32") until you rename it; a name you type stays. Open the projects sheet from the project name at the top to rename, save (⌘S), save as copy, start a new project, open, or swipe a project to the left to delete it: a badge lets you restore it for 5 seconds before it is gone for good.

## iPhone app

iOS browsers have no Web MIDI, so `ios/` holds a small app: a full-screen WebView with a CoreMIDI bridge (`MIDIBridge.swift` + `midi-shim.js`). It loads the published page and falls back to the bundled copy offline.

```
cd ios && xcodegen generate && open HiChordSampler.xcodeproj
```
Pick your team under Signing & Capabilities, plug in the iPhone and press Run.

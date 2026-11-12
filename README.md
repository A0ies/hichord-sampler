# HiChord Looper

A looper for the HiChord pocket synth, in the spirit of [fm1-sampler](https://github.com/ferluht/fm1-sampler): you play on the HiChord, this app records it in layers and makes the sound, and you change timing, instruments and mix while it loops.

Open it at https://a0ies.github.io/hichord-sampler/ (Chrome or Edge), or use the iPhone app in `ios/`.

## How it works

- **Layers.** Eight layers; whatever you play goes into the selected one. Press record (R), play, press record again. Each pass is a take you can undo.
- **Capture mode.** Capture (C) turns every layer into a full-screen touch pad, with its icon and a small timeline. Tap a pad to switch the layer on or off; hold and drag to play its effect (low-pass, high-pass, stutter gate, delay throw, reverb wash, pitch bend or drive, chosen per layer under Mix, or by tapping the effect label next to the layer's name). Let go and the effect springs back, unless you lock it: hold the effect still for 2 seconds (a ring fills around your finger) and a pulsing lock key appears in the pad's bottom-right corner. Press it with your other hand and the effect stays where you left it; the key turns solid (“locked ×”), and pressing it again releases the effect. Touch a locked pad to move its effect. At the bottom, a record strip (in place of the transport bar) records what you hear to an audio file, with a timer and level meter; capture mode never records into a layer.
- **Layer effects.** On the layers screen, each layer has effect chips (low-pass, high-pass, gate, delay, reverb, pitch, drive): “+” adds one, tap a chip to set its amount or remove it. They stay on; capture mode plays on top of them and springs back to them. The gate has note keys (1/4 to 1/32, and triplets) in its pop-up and on its capture pad; in capture mode dragging up makes it deeper.
- **MIDI, not audio.** The app stores the notes you played. That is why timing and instruments stay editable after recording.
- **Timing, live.** Per layer: quantize (1/4 to 1/16 triplets), strength, swing, nudge, note length, humanize, octave. Switch from feel to advanced for an XY screen that sets strength (left–right) and humanize (up–down), with the grid, swing, note length and nudge underneath. The layer panel keeps one height on every page, with clear notes and remove layer (tap twice) at the bottom, and above it a preview screen: the layer's timeline with its playhead, and under it a strip with the live waveform, filter curve and envelope, a play key and a solo key. Your original timing is never changed; Quantize Off brings it back. Tempo changes re-time every layer at once.
- **Instruments.** Multisampled in Ableton: grand piano, Rhodes, strings, horns, electric guitar, saw lead, square lead, pad, electric bass, synth bass and drums (the drums follow the HiChord's drum pads). Each lives in `sounds/` as one AAC file with a note every 3 semitones; `sounds/sounds.json` holds where each note and its loop start. Bass and drum layers play single notes: bass plays the chord's root, and on drums every chord key gets its own drum (I kick, II snare, III hat, IV open hat, V tom, VI percussion, VII crash, following the HiChord's key). The HiChord's drum pads on channel 10 can still hit two drums at once. Or use your own sound from the microphone or an audio file.
- **Loop.** 1 to 16 bars, ×2 to double, count-in and click.
- **Song parts.** Above the layers: parts A, B, C… Each part has its own notes per layer and its own set of layers on or off; instruments, effects and mix are shared. The song panel (tap the part you are on, or the timeline icon) names, copies and removes parts and builds the timeline: one block is one pass of the loop. Capture mode follows the timeline: a countdown in the last bar, then it moves to the next part on the 1. Tap a block to go there after this loop; turn auto off to keep looping one part.
- **Note editor (piano roll).** Opens with the select tool, on chords (bass and drums on single notes), and shows the whole loop again when you turn the phone. Undo and redo sit top left, close top right. Like in Ableton: double-click/double-tap to add, drag to move in time and pitch, drag an edge to lengthen or shorten, drag empty space to select, Alt-drag to copy, a velocity lane, snap from 1/4 to 1/32, quantize, duplicate, undo/redo and keyboard shortcuts (⌫, ⌘D, ⌘A, ⌘Z, arrows, Q, B). On a phone: one finger pans, two fingers zoom, Draw adds with a single tap.
- **HiChord.** Notes always come in over USB MIDI. Connect HiChord to also see and set its key, scale, octave, play mode and sound, follow its tempo or send yours, and let its start/stop run the loop.
- **Settings.** The HiChord's screen sits at the top (on the left in landscape): connect, and once connected tap key, scale, octave, mode or sound to change it on the HiChord. Tabs underneath switch between sync, sound check and room; nothing scrolls.
- **Projects.** Every session is a project that saves itself (IndexedDB), including your own sounds. A new project is named after its creation date and time ("11 Nov 2026 · 14:32") until you rename it; a name you type stays. Open the projects sheet from the project name at the top to rename, duplicate, start a new project (the “+ new project” tile above your projects), open, or swipe a project to the left to delete it: a badge lets you restore it for 5 seconds before it is gone for good.

## iPhone app

iOS browsers have no Web MIDI, so `ios/` holds a small app: a full-screen WebView with a CoreMIDI bridge (`MIDIBridge.swift` + `midi-shim.js`). It loads the published page and falls back to the bundled copy offline.

```
cd ios && xcodegen generate && open HiChordSampler.xcodeproj
```
Pick your team under Signing & Capabilities, plug in the iPhone and press Run.

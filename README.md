# HiChord Sampler

A browser sampler for the HiChord pocket synth, in the spirit of [fm1-sampler](https://github.com/ferluht/fm1-sampler): the HiChord is the controller (over Web MIDI), the browser makes the sound.

- 8 tracks, each listening to one MIDI channel. The HiChord plays live on channel 1, moves up a channel after each looper layer, and sends drums on channel 10.
- Modes: Melodic, One-shot, Loop, Kit (slices on transients, mapped to the HiChord drum pads), Granular.
- Per track: start/end, root note, transpose, ADSR, filter, volume, pan, reverb and delay sends.
- Global: reverb, tempo-synced delay, tape drive. Tempo follows the HiChord's MIDI clock.
- Sources: built-in sounds, audio files, microphone (with auto-tune).
- Export for HiChord: a mono WAV of up to 1.4 s to upload with the official Companion App.

Use Chrome or Edge on a computer or Android. iOS browsers have no Web MIDI, so on iPhone only the test chords work.

## HiChord control

Press **Connect HiChord** (allow MIDI with SysEx). The app sends the same handshake as the official Companion App, then:
- shows the HiChord's key, scale, octave, tempo, mode and sound as you change them on the device;
- sets sound, key, scale, octave, mode, tempo, filter, reverb and envelope on the HiChord;
- sends the selected track's sample to the HiChord as its User Sample, or a Kit track's slices to its User Kit pads.

## iPhone app

iOS browsers have no Web MIDI, so `ios/` holds a small iPhone app: a WebView with a CoreMIDI bridge (`MIDIBridge.swift` + `midi-shim.js`). It loads the published page and falls back to the bundled copy offline.

```
cd ios && xcodegen generate && open HiChordSampler.xcodeproj
```
Pick your team under Signing & Capabilities, plug in the iPhone and press Run.

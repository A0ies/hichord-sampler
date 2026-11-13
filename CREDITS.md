# Credits and licences of the bundled sounds

Every instrument in `sounds/` is built by `tools/build_sounds.py` from the sources below. The samples were trimmed,
levelled, given loop points where the sound sustains, encoded to AAC and packed one file per instrument; no
other changes. The licence of each source was checked in the project's own licence file (linked).

| Instrument | Source | Author | Licence |
|---|---|---|---|
| Grand piano | [Salamander Grand Piano V3](https://github.com/sfzinstruments/SalamanderGrandPiano) (velocity layer 8) | Alexander Holm | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) · [licence file](https://github.com/sfzinstruments/SalamanderGrandPiano/blob/master/LICENSE) |
| Strings | [VSCO 2 Community Edition](https://versilian-studios.com/vsco-community/): cello, viola and violin sections, solo violin | Versilian Studios / Sam Gossner | [CC0 1.0](https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE) |
| Horns | VSCO 2 Community Edition: F horn, sustain | Versilian Studios / Sam Gossner | [CC0 1.0](https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE) |
| Electric guitar | [FSBS Electric Guitar Clean](https://github.com/freepats/electric-guitar-FSBS-clean) (bridge pickup) | FreePats | [CC0 1.0](https://github.com/freepats/electric-guitar-FSBS-clean/blob/main/LICENSE.txt) |
| Electric bass | [Growlybass](https://github.com/sfzinstruments/karoryfer.growlybass) (Squier Jazz Bass) | Karoryfer Lecolds | [CC0 1.0](https://github.com/sfzinstruments/karoryfer.growlybass/blob/master/LICENSE) |
| Drums | [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums) (mid microphones) | Versilian Studios, with Karoryfer; played by Austin McMahon | [CC0 1.0](https://github.com/sfzinstruments/virtuosity_drums/blob/master/LICENSE) |
| Electric piano, saw lead, square lead, pad, synth bass | synthesised for this app by `tools/synth_sounds.py` (no samples) | Looper for HiChord | CC0 1.0 |

The Salamander Grand Piano is used under CC BY 3.0: credit to Alexander Holm, with the changes listed above.
VSCO 2 CE is CC0; Versilian Studios asks (without obligation) for credit and that the samples not be sold on their
own, which this app doesn't do.

## Your own sounds

Sounds you add yourself (an audio file, the microphone, or your HiChord sampled over USB) are stored only in your
browser's storage on your device, with the project they belong to. They leave the device only when you share that
project with a code: then the project and its own sounds go to the share relay, which deletes them as soon as the
other device has received them, or after 24 hours. The app never publishes them. The HiChord instruments (Settings → Sync) never leave the device: a shared project only names its instruments. Sounds of the HiChord belong to Pocket Audio; sample your own HiChord for your own music.

## Rebuilding

```
python tools/synth_sounds.py <sources>/synths      # the synths (needs numpy, scipy)
python tools/fetch_sources.py <sources>            # downloads just the files used, plus each licence file
python tools/build_sounds.py <sources>/config.json sounds <temp dir>   # macOS afconvert for decoding and AAC
```
Keep `<sources>` outside the app folder: only the packed output belongs in `sounds/`.

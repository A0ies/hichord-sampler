/* Feature boxes on the landing page.
   Each feature section gets a small working piece of the app that plays the demo song
   (Am F C G at 96 bpm, five layers) with the app's own instruments from media/sounds.

   Sound rules
   - touching a box gives it the sound and takes it away from any other box (and from the demo video)
   - scrolling a box mostly out of view takes its sound away; only touching it again brings it back
   - the round button bottom right mutes and unmutes by hand; a hand mute holds until you touch another box or scroll away
   - "original" top right puts the box back the way it was
   All boxes share one clock, so they stay on the same beat. */
(() => {
  'use strict';
  const hosts = [...document.querySelectorAll('.fbox[data-box]')];
  if (!hosts.length) return;

  // where the app's instrument files are: <script src="feature-boxes.js" data-sounds="../sounds/"> on the site
  const SOUNDS = (document.currentScript && document.currentScript.dataset.sounds) || 'media/sounds/';
  const BPM = 96, LOOP = 16;
  const SEC = 60 / BPM;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const button = (cls, html, label) => { const b = el('button', cls, html); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const hash = k => { const x = Math.sin(k * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };   // a steady 0..1 per number

  /* ---------- the instruments (same files and release times as the app) ---------- */
  const INST = {
    piano: { name: 'grand piano', r: 0.35 }, keys: { name: 'electric piano', r: 0.35 }, guitar: { name: 'electric guitar', r: 0.3 },
    strings: { name: 'strings', r: 0.6 }, horns: { name: 'horns', r: 0.25 }, pad: { name: 'pad', r: 1 },
    lead: { name: 'saw lead', r: 0.15 }, square: { name: 'square lead', r: 0.15 }, ebass: { name: 'electric bass', r: 0.2 },
    bass: { name: 'synth bass', r: 0.12 }, drums: { name: 'drums', r: 0.1 },
  };
  const TONAL = Object.keys(INST).filter(k => k !== 'drums');
  const BASE = ['keys', 'bass', 'pad', 'drums', 'lead'];
  const COL = ['#2f6fe0', '#00a651', '#ff5000', '#ffc400', '#ff3d8b'];
  const MIX = [0.6, 0.62, 0.42, 0.62, 0.5];   // layer volume
  const REV = [0.18, 0.15, 0.35, 0.1, 0.2];   // reverb send
  const GM_KIT = { 36: 0, 38: 1, 42: 2, 46: 3, 49: 4, 45: 5, 56: 6 };   // kick, snare, closed hat, open hat, crash, tom, perc

  /* ---------- the demo song (the same one as in the videos) ---------- */
  const SONG = (() => {
    const ev = (beat, dur, note, vel, chord) => ({ beat, dur, note, vel, chord: chord == null ? null : chord });
    const C = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], roots = [45, 41, 48, 43];
    const keys = [], bass = [], pad = [], drums = [], lead = [];
    let chord = 0;
    for (let b = 0; b < 4; b++) {
      const o = b * 4;
      for (const [t, d, v] of [[0, 1.2, 104], [1.5, 0.45, 86], [2.5, 1.3, 96]]) { const c = chord++; C[b].forEach(n => keys.push(ev(o + t, d, n + 12, v, c))); }
      for (const [t, d] of [[0, 0.7], [0.75, 0.2], [1.5, 0.45], [2.5, 0.4], [3, 0.4], [3.5, 0.4]]) bass.push(ev(o + t, d, roots[b] - 12 + (t === 3 ? 12 : 0), 100));
      { const c = chord++; C[b].forEach(n => pad.push(ev(o, 3.9, n, 80, c))); }
      for (let s = 0; s < 8; s++) drums.push(ev(o + s * 0.5, 0.2, 42, s % 2 ? 70 : 96));
      drums.push(ev(o, 0.3, 36, 120), ev(o + 1.75, 0.3, 36, 100), ev(o + 2.5, 0.3, 36, 112));
      drums.push(ev(o + 1, 0.3, 38, 110), ev(o + 3, 0.3, 38, 116));
    }
    const mel = [[0, 76], [0.5, 74], [1, 72], [1.5, 69], [2.5, 72], [3, 74], [4, 72], [5, 69], [6, 77], [6.5, 76], [7, 72], [8, 76], [9, 79], [10, 76], [11, 74], [12, 74], [13, 71], [14, 67], [15, 71]];
    mel.forEach(([t, n], k) => lead.push(ev(t, (mel[k + 1] ? mel[k + 1][0] : 16) - t - 0.05, n, 92)));
    return [keys, bass, pad, drums, lead];
  })();
  const CHORDS = ['Am', 'F', 'C', 'G'];
  const PARTS = [
    { letter: 'A', name: 'intro', color: COL[0], on: [1, 0, 1, 0, 0] },
    { letter: 'B', name: 'verse', color: COL[1], on: [1, 1, 1, 1, 0] },
    { letter: 'C', name: 'chorus', color: COL[2], on: [1, 1, 1, 1, 1] },
  ];
  const ORDER = [0, 1, 1, 2, 2, 1, 2];

  // every note of a 16-beat loop that starts in [b1, b2), in absolute beats
  function loopEvents(b1, b2, list, beatOf, fn) {
    for (let k = Math.floor(b1 / LOOP); k * LOOP < b2; k++) {
      const base = k * LOOP;
      for (const e of list) { const b = base + beatOf(e); if (b >= b1 && b < b2) fn(e, b); }
    }
  }
  const plain = e => e.beat;

  /* ---------- sounds: fetched and decoded before anyone taps, so the first tap is heard at once ---------- */
  const READY = {}, LOADS = {};
  let manifest = null, decoder = null;
  const manifestP = () => manifest || (manifest = fetch(SOUNDS + 'sounds.json').then(r => { if (!r.ok) throw new Error('sounds.json ' + r.status); return r.json(); }));
  function load(key) {
    return LOADS[key] || (LOADS[key] = (async () => {
      const man = (await manifestP())[key];
      const res = await fetch(SOUNDS + key + '.m4a'); if (!res.ok) throw new Error(key + ' ' + res.status);
      const data = await res.arrayBuffer();
      // an offline context decodes without needing a tap first; the buffers play in the real context later
      decoder = decoder || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 48000);
      const buffer = await new Promise((ok, no) => decoder.decodeAudioData(data, ok, no));
      // decoders put different amounts of silence in front: measure it on the first note and shift every position (as the app does)
      const ch = [...Array(buffer.numberOfChannels)].map((_, c) => buffer.getChannelData(c)), lim = Math.min(buffer.length, Math.floor(buffer.sampleRate * 1.5));
      let first = 0; while (first < lim && !ch.some(d => Math.abs(d[first]) > 0.01)) first++;
      const shift = first < lim ? first / buffer.sampleRate - man.probe : 0;
      const zones = man.zones.map(z => Object.assign({}, z, { start: z.start + shift, loop: z.loop && [z.loop[0] + shift, z.loop[1] + shift] }));
      READY[key] = { buffer, zones, kind: man.kind };
    })().catch(e => { delete LOADS[key]; console.warn('feature boxes: sound', key, e); }));
  }
  function zoneFor(zones, n) {
    let best = zones[0];
    for (const z of zones) { const d = Math.abs(n - z.note), bd = Math.abs(n - best.note); if (d < bd || (d === bd && z.note < best.note)) best = z; }
    return best;
  }

  /* ---------- audio: one context, made on the first touch of a box ---------- */
  let ctx = null, master = null, revIn = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      // iPhone: play like a music app, so the silent switch doesn't mute it
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = 0.85;
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
      master.connect(lim).connect(ctx.destination);
      const conv = ctx.createConvolver(), out = ctx.createGain(); out.gain.value = 0.8;
      const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { const t = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * t); d[i] = lp * Math.pow(1 - t, 3.2); } }
      conv.buffer = ir; revIn = ctx.createGain(); revIn.connect(conv).connect(out).connect(master);
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }

  // one song clock for every box: the audio clock once it runs, the page clock before that (no jump when it switches)
  const clock = { onCtx: false, off: 0, poff: null, last: 0 };
  function now() {
    if (ctx && ctx.state === 'running') {
      if (!clock.onCtx) { clock.onCtx = true; clock.off = clock.last - ctx.currentTime; }
      return (clock.last = ctx.currentTime + clock.off);
    }
    const p = performance.now() / 1000;
    if (clock.onCtx || clock.poff == null) { clock.onCtx = false; clock.poff = clock.last - p; }
    return (clock.last = p + clock.poff);
  }
  const beatNow = () => now() / SEC;
  const ctxTime = beat => beat * SEC - clock.off;

  // a box's sound: five lanes (one per layer) into the box's own gain, which mutes and unmutes it
  function chain(box) {
    if (box.ch || !ctx) return box.ch;
    const bus = ctx.createGain(), wet = ctx.createGain(); bus.gain.value = 0; wet.gain.value = 0;
    bus.connect(master); wet.connect(revIn);
    const lanes = BASE.map((_, i) => {
      const vol = ctx.createGain(), sh = ctx.createWaveShaper(), drv = ctx.createGain(), hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), gate = ctx.createGain();
      hp.type = 'highpass'; hp.frequency.value = 10; hp.Q.value = 0.7; lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.7;
      vol.gain.value = MIX[i];
      vol.connect(sh).connect(drv).connect(hp).connect(lp).connect(gate).connect(bus);
      const rs = ctx.createGain(); rs.gain.value = REV[i]; gate.connect(rs).connect(wet);
      const ds = ctx.createGain(), dl = ctx.createDelay(2), fb = ctx.createGain(); ds.gain.value = 0; dl.delayTime.value = 0.75 * SEC; fb.gain.value = 0.42;
      gate.connect(ds).connect(dl); dl.connect(fb).connect(dl); dl.connect(bus); dl.connect(wet);
      return { in: vol, vol, sh, drv, hp, lp, gate, dly: ds, fb, rs };
    });
    box.ch = { bus, wet, lanes };
    if (box.onChain) box.onChain();
    return box.ch;
  }
  function fade(box, v) { if (!box.ch) return; const t = ctx.currentTime; [box.ch.bus, box.ch.wet].forEach(n => { n.gain.cancelScheduledValues(t); n.gain.setTargetAtTime(v, t, 0.03); }); }
  const level = (p, v) => { if (ctx) p.setTargetAtTime(v, ctx.currentTime, 0.02); };

  function voice(box, lane, key, note, vel, when, dur) {
    const s = READY[key]; if (!s) { load(key); return; }
    const g = ctx.createGain(), src = ctx.createBufferSource(); src.buffer = s.buffer;
    const v = clamp(vel / 127, 0.05, 1);
    g.connect(box.ch.lanes[lane].in); src.connect(g);
    if (s.kind === 'kit') {
      const z = s.zones[GM_KIT[note] != null ? GM_KIT[note] : 2];
      g.gain.value = v; src.start(when, z.start, z.len);
    } else {
      const z = zoneFor(s.zones, note), r = INST[key].r, end = when + Math.max(dur, 0.01);
      src.playbackRate.value = Math.pow(2, (note - z.note) / 12);
      if (z.loop) { src.loop = true; src.loopStart = z.loop[0]; src.loopEnd = z.loop[1]; src.start(when, z.start); } else src.start(when, z.start, z.len);
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.003);
      g.gain.setTargetAtTime(0, end, Math.max(0.005, r / 4));
      src.stop(end + r * 1.4 + 0.05);
    }
    const vc = { g, src }; box.voices.add(vc);
    src.onended = () => { try { g.disconnect(); } catch (e) {} box.voices.delete(vc); };
  }
  // cut what a box is playing (when it jumps to another place in the song)
  function hush(box) {
    if (!ctx) return; const t = ctx.currentTime;
    box.voices.forEach(v => { try { const p = v.g.gain; if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.012); v.src.stop(t + 0.08); } catch (e) {} });
  }
  // play one note right now (when you add or move a note), if this box has the sound
  function blip(box, lane, key, note) { if (loud === box && ctx && ctx.state === 'running' && chain(box)) voice(box, lane, key, note, 96, ctx.currentTime + 0.005, 0.35); }

  /* ---------- the scheduler: only the box you hear plays notes ---------- */
  let loud = null;
  setInterval(() => {
    if (!loud || !ctx || ctx.state !== 'running' || !chain(loud)) return;
    const box = loud, t = now(), nb = t / SEC, end = (t + 0.12) / SEC;
    if (box.sched == null || box.sched < nb - 0.05 || box.sched > end + 1) box.sched = nb;
    if (end <= box.sched) return;
    const from = box.sched;
    box.events(from, end, (lane, key, note, vel, beat, dur) => voice(box, lane, key, note, vel, Math.max(ctx.currentTime, ctxTime(beat)), dur * SEC));
    if (box.tick) box.tick(from, end);
    box.sched = end;
  }, 25);

  /* ---------- drawing helpers ---------- */
  function canvas(parent, cls, label) {
    const c = el('canvas', cls); if (label) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', label); }
    parent.appendChild(c);
    const fit = () => { const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d)); c.d = d; };
    new ResizeObserver(fit).observe(c); fit();
    return c;
  }
  const range = list => { let lo = 127, hi = 0; list.forEach(e => { lo = Math.min(lo, e.note); hi = Math.max(hi, e.note); }); return [lo, hi]; };
  const RANGES = SONG.map(range);
  // a layer's notes on black, like the strips in the app
  function strip(c, list, color, pos, opts) {
    const g = c.getContext('2d'), W = c.width, H = c.height, d = c.d || 1; if (W < 4) return;
    g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a2a28'; for (let i = 1; i < 4; i++) g.fillRect(Math.round(i * W / 4), 0, d, H);
    const [lo, hi] = opts.range, pad = 5 * d, nh = Math.max(2 * d, Math.min(4 * d, (H - 2 * pad) / Math.max(4, hi - lo + 1)));
    g.globalAlpha = opts.dim ? 0.28 : 1; g.fillStyle = color;
    for (const e of list) {
      const x = e.beat / LOOP * W, w = Math.max(2 * d, e.dur / LOOP * W - d), y = hi === lo ? H / 2 : pad + (hi - e.note) / (hi - lo) * (H - 2 * pad - nh);
      g.fillRect(x, y, w, nh);
    }
    g.globalAlpha = 1;
    if (pos != null) { g.fillStyle = '#fff'; g.fillRect(Math.round(pos / LOOP * W), 0, Math.max(1, 1.5 * d), H); }
  }

  const ICON_ORIG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/></svg>';
  const ICON_MUTE = '<svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/></svg>'
    + '<svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  const pressed = (b, on) => b.setAttribute('aria-pressed', on ? 'true' : 'false');

  /* ================= 1 · layers: mute, solo and swap the sound of each layer ================= */
  function layersBox(box) {
    const st = { inst: BASE.slice(), mute: [0, 0, 0, 0, 0], solo: [0, 0, 0, 0, 0] };
    const audible = i => (st.solo.some(Boolean) ? !!st.solo[i] : !st.mute[i]);
    const list = el('div', 'lcards'); box.body.appendChild(list);
    const cards = BASE.map((key, i) => {
      const card = el('div', 'lcard');
      card.appendChild(el('span', 'badge' + (i === 3 ? ' dark' : ''), String(i + 1))).style.background = COL[i];
      const name = el('div', 'lname');
      let sel = null;
      if (key === 'drums') name.appendChild(el('span', 'lfixed', 'drums'));
      else {
        sel = el('select', 'lsel'); sel.setAttribute('aria-label', 'Sound of layer ' + (i + 1));
        TONAL.forEach(k => { const o = el('option', null, INST[k].name); o.value = k; sel.appendChild(o); });
        sel.value = key; name.appendChild(sel);
        sel.addEventListener('change', () => { st.inst[i] = sel.value; load(sel.value); apply(); });
      }
      card.appendChild(name);
      const m = button('lbtn m', 'M', 'Mute layer ' + (i + 1)), s = button('lbtn s', 'S', 'Solo layer ' + (i + 1));
      s.style.setProperty('--c', COL[i]);
      m.addEventListener('click', () => { st.mute[i] ^= 1; apply(); });
      s.addEventListener('click', () => { st.solo[i] ^= 1; apply(); });
      card.append(m, s);
      const cv = canvas(card, 'lstrip', BASE[i] + ' notes');
      list.appendChild(card);
      return { card, sel, m, s, cv };
    });
    function apply() {
      cards.forEach((c, i) => {
        c.card.classList.toggle('off', !audible(i)); pressed(c.m, st.mute[i]); pressed(c.s, st.solo[i]);
        if (c.sel && c.sel.value !== st.inst[i]) c.sel.value = st.inst[i];
        if (box.ch) level(box.ch.lanes[i].vol.gain, audible(i) ? MIX[i] : 0);
      });
      box.changed();
    }
    box.onChain = apply;
    box.events = (b1, b2, emit) => SONG.forEach((list, i) => { if (audible(i)) loopEvents(b1, b2, list, plain, (e, b) => emit(i, st.inst[i], e.note, e.vel, b, e.dur)); });
    box.draw = beat => {
      const pos = mod(beat, LOOP);
      box.info.textContent = (Math.floor(pos / 4) + 1) + '.' + (Math.floor(pos % 4) + 1);
      cards.forEach((c, i) => { strip(c.cv, SONG[i], COL[i], pos, { range: RANGES[i], dim: !audible(i) }); c.card.classList.toggle('loading', !READY[st.inst[i]] && !!LOADS[st.inst[i]]); });
    };
    box.isOriginal = () => st.inst.every((k, i) => k === BASE[i]) && !st.mute.some(Boolean) && !st.solo.some(Boolean);
    box.reset = () => { st.inst = BASE.slice(); st.mute.fill(0); st.solo.fill(0); apply(); };
  }

  /* ================= 2 · change it later: move whole chords, drag their start and end ================= */
  function editorBox(box) {
    const LO = 57, HI = 79, ROWS = HI - LO + 1, BLACK = [1, 3, 6, 8, 10];
    const ROOT = { Am: [9, 'm'], F: [5, ''], C: [0, ''], G: [7, ''] };
    const original = () => {
      const map = new Map();
      SONG[0].forEach(e => {
        if (!map.has(e.chord)) map.set(e.chord, { id: e.chord, beat: e.beat, dur: e.dur, vel: e.vel, notes: [], name: CHORDS[Math.floor(e.beat / 4)], shift: 0 });
        map.get(e.chord).notes.push(e.note);
      });
      return [...map.values()];
    };
    const st = { chords: original(), hover: null };
    const label = c => { const [pc, q] = ROOT[c.name]; return NAMES[mod(pc + c.shift, 12)] + q; };
    const lowest = c => Math.min(...c.notes) + c.shift, highest = c => Math.max(...c.notes) + c.shift;
    const play = c => c.notes.forEach(n => blip(box, 0, 'keys', n + c.shift));

    const cv = canvas(box.body, 'eroll', 'Piano roll of the electric piano: drag a chord to move it, drag its edges to change where it starts and ends');
    cv.dataset.grab = '';

    // the control bar under the roll, as in the app on a phone: play / stop, where it is, and the grid
    const GRIDS = [[1, '1/4'], [0.5, '1/8'], [0.25, '1/16']];
    const bar = el('div', 'ebar');
    const playBtn = button('ebig eplay', '', 'Stop');
    const posEl = el('div', 'epos', '<b>1.1</b><small>playing</small>');
    const gridBtn = button('egrid', '<small>grid</small><b>1/16</b>', 'Grid: 1/16. Tap to change');
    bar.append(playBtn, posEl, el('span', 'espace'), gridBtn);
    box.body.appendChild(bar);
    const t = { origin: 0, stopped: false, frozen: 0, grid: 2 };
    const posAt = beat => (t.stopped ? t.frozen : mod(beat - t.origin, LOOP));
    function setPlaying(on) {
      if (on === !t.stopped) return;
      if (on) { t.origin = beatNow() - t.frozen; t.stopped = false; box.sched = null; }
      else { t.frozen = posAt(beatNow()); t.stopped = true; hush(box); }
      playBtn.classList.toggle('stopped', t.stopped); playBtn.setAttribute('aria-label', t.stopped ? 'Play' : 'Stop');
      posEl.lastChild.textContent = t.stopped ? 'stopped' : 'playing';
    }
    playBtn.addEventListener('click', () => setPlaying(t.stopped));
    gridBtn.addEventListener('click', () => {
      t.grid = (t.grid + 1) % GRIDS.length; const g = GRIDS[t.grid][1];
      gridBtn.lastChild.textContent = g; gridBtn.setAttribute('aria-label', 'Grid: ' + g + '. Tap to change');
    });
    const snap = v => { const g = GRIDS[t.grid][0]; return Math.round(v / g) * g; };

    function geo() { const d = cv.d || 1, W = cv.width, H = cv.height, kw = 34 * d, top = 18 * d; return { d, W, H, kw, top, bw: (W - kw) / LOOP, rh: (H - top) / ROWS }; }
    const rect = (c, G) => ({ x: G.kw + c.beat * G.bw, w: c.dur * G.bw, y: G.top + (HI - highest(c)) * G.rh, h: (highest(c) - lowest(c) + 1) * G.rh });
    function hit(x, y) {
      const G = geo();
      for (let k = st.chords.length - 1; k >= 0; k--) {
        const c = st.chords[k], r = rect(c, G), pad = 3 * G.d;
        if (x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad) continue;
        const edge = Math.min(8 * G.d, r.w / 3.5);
        return { c, zone: x < r.x + edge ? 'start' : x > r.x + r.w - edge ? 'end' : 'move' };
      }
      return null;
    }
    const at = e => { const r = cv.getBoundingClientRect(), d = cv.d || 1; return [(e.clientX - r.left) * d, (e.clientY - r.top) * d]; };
    const CURSOR = { move: 'grab', start: 'ew-resize', end: 'ew-resize' };
    let drag = null;
    cv.addEventListener('pointerdown', e => {
      const [x, y] = at(e), h = hit(x, y); if (!h) return;
      cv.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x0: x, y0: y, c: h.c, zone: h.zone, beat0: h.c.beat, dur0: h.c.dur, shift0: h.c.shift };
      st.hover = h; cv.style.cursor = h.zone === 'move' ? 'grabbing' : 'ew-resize';
      if (h.zone === 'move') play(h.c);
    });
    cv.addEventListener('pointermove', e => {
      const [x, y] = at(e), G = geo();
      if (!drag) { const h = e.pointerType === 'mouse' ? hit(x, y) : null; st.hover = h; cv.style.cursor = h ? CURSOR[h.zone] : 'default'; return; }
      if (drag.id !== e.pointerId) return;
      const c = drag.c, dB = snap((x - drag.x0) / G.bw), g0 = GRIDS[t.grid][0];
      if (drag.zone === 'move') {
        c.beat = clamp(drag.beat0 + dB, 0, LOOP - c.dur);
        const lo = Math.min(...c.notes), hi = Math.max(...c.notes);
        const shift = clamp(drag.shift0 - Math.round((y - drag.y0) / G.rh), LO - lo, HI - hi);
        if (shift !== c.shift) { c.shift = shift; play(c); }
      } else if (drag.zone === 'start') {
        const end = drag.beat0 + drag.dur0; c.beat = clamp(drag.beat0 + dB, 0, end - Math.min(g0, drag.dur0)); c.dur = end - c.beat;
      } else c.dur = clamp(drag.dur0 + dB, Math.min(g0, drag.dur0), LOOP - c.beat);
      box.changed();
    });
    const up = e => { if (!drag || drag.id !== e.pointerId) return; drag = null; const [x, y] = at(e), h = e.pointerType === 'mouse' ? hit(x, y) : null; st.hover = h; cv.style.cursor = h ? CURSOR[h.zone] : 'default'; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!drag) { st.hover = null; cv.style.cursor = 'default'; } });

    box.events = (b1, b2, emit) => {
      if (t.stopped) return;
      const o = t.origin;   // the loop starts where you last pressed play
      loopEvents(b1 - o, b2 - o, st.chords, c => c.beat, (c, b) => c.notes.forEach(n => emit(0, 'keys', n + c.shift, c.vel, b + o, c.dur)));
      loopEvents(b1 - o, b2 - o, SONG[1], plain, (e, b) => emit(1, 'bass', e.note, e.vel, b + o, e.dur));
      loopEvents(b1 - o, b2 - o, SONG[3], plain, (e, b) => emit(3, 'drums', e.note, e.vel, b + o, e.dur));
    };
    box.draw = beat => {
      const pos = posAt(beat), g = cv.getContext('2d'), G = geo(), { d, W, H, kw, top, bw, rh } = G; if (W < 4) return;
      box.info.textContent = posEl.firstChild.textContent = (Math.floor(pos / 4) + 1) + '.' + (Math.floor(pos % 4) + 1);
      g.fillStyle = '#131312'; g.fillRect(0, 0, W, H);
      for (let n = LO; n <= HI; n++) {
        const y = top + (HI - n) * rh, black = BLACK.includes(n % 12);
        g.fillStyle = black ? '#0d0d0c' : '#171716'; g.fillRect(kw, y, W - kw, rh);
        g.fillStyle = black ? '#0a0a0a' : '#2b2b29'; g.fillRect(0, y + 0.5 * d, kw - 2 * d, rh - d);
        if (n % 12 === 0) { g.fillStyle = '#8d8d87'; g.font = `500 ${9 * d}px "IBM Plex Mono",monospace`; g.textBaseline = 'middle'; g.fillText(noteName(n), 4 * d, y + rh / 2); }
      }
      for (let b = 0; b <= LOOP; b += 0.5) { const x = Math.round(kw + b * bw); g.fillStyle = b % 4 === 0 ? '#4a4a47' : b % 1 === 0 ? '#262624' : '#1c1c1b'; g.fillRect(x, top, d, H - top); }
      g.fillStyle = '#0b0b0b'; g.fillRect(0, 0, W, top);
      g.fillStyle = '#d9d9d5'; g.font = `600 ${10 * d}px "IBM Plex Mono",monospace`; g.textBaseline = 'middle';
      for (let k = 0; k < 4; k++) g.fillText(String(k + 1), kw + k * 4 * bw + 4 * d, top / 2);
      const hv = st.hover && st.hover.c, held = drag && drag.c;
      for (const c of st.chords) {
        const r = rect(c, G), hot = c === hv || c === held;
        g.fillStyle = hot ? 'rgba(91,143,240,.24)' : 'rgba(47,111,224,.10)'; g.fillRect(r.x, r.y, Math.max(4 * d, r.w - 2 * d), r.h);   // the chord's shading
        for (const n of c.notes) {
          const y = top + (HI - n - c.shift) * rh, w = Math.max(4 * d, r.w - 2 * d);
          g.fillStyle = c === held ? '#7aa6ff' : hot ? '#5b8ff0' : '#2f6fe0'; g.fillRect(r.x, y + d, w, rh - 2 * d);
          if (w > 26 * d && rh > 11 * d) { g.fillStyle = '#fff'; g.font = `600 ${Math.min(10, rh / d - 4) * d}px "IBM Plex Mono",monospace`; g.fillText(noteName(n + c.shift), r.x + 3 * d, y + rh / 2); }
        }
        if (hot) {
          g.strokeStyle = '#fff'; g.lineWidth = 1.5 * d; g.strokeRect(r.x - d, r.y - d, Math.max(4 * d, r.w - 2 * d) + 2 * d, r.h + 2 * d);
          const z = (drag && drag.c === c ? drag.zone : st.hover && st.hover.zone);
          if (z === 'start' || z === 'end') { g.fillStyle = '#fff'; g.fillRect(z === 'start' ? r.x - 2 * d : r.x + r.w - 4 * d, r.y - 2 * d, 3 * d, r.h + 4 * d); }
        }
        if (r.y - top > 11 * d) { g.fillStyle = hot ? '#fff' : '#8d8d87'; g.font = `500 ${9 * d}px "IBM Plex Mono",monospace`; g.textBaseline = 'bottom'; g.fillText(label(c), r.x + 1 * d, r.y - 2 * d); g.textBaseline = 'middle'; }
      }
      g.fillStyle = '#fff'; g.fillRect(Math.round(kw + pos * bw), 0, Math.max(1, 1.5 * d), H);
    };
    box.isOriginal = () => { const o = original(); return st.chords.every((c, k) => c.beat === o[k].beat && c.dur === o[k].dur && c.shift === 0); };
    box.reset = () => { st.chords = original(); setPlaying(true); box.changed(); };
  }

  /* ================= 3 · capture mode: tap on / off, hold and drag across the grid for an effect, hold still to lock ================= */
  function captureBox(box) {
    const GATE = [[1, '1/4'], [2, '1/8'], [4, '1/16'], [8, '1/32']];
    const hz = f => (f >= 1000 ? (f / 1000).toFixed(1) + ' kHz' : Math.round(f) + ' Hz');
    const pct = v => Math.round(v * 100) + '%';
    const gateOf = x => GATE[Math.min(3, Math.floor(x * 4))];
    // each effect sits on the layer where you hear it best, over the range where it really changes the sound
    const FX = [
      { k: 'lp', chip: '◢ low-pass', how: '↑ darker · → resonance' },     // electric piano
      { k: 'drive', chip: '∿ drive', how: '↑ dirtier · → brighter' },     // synth bass
      { k: 'gate', chip: '▥ gate', how: '↑ deeper · → faster' },          // pad (held chords: you hear every chop)
      { k: 'hp', chip: '◣ high-pass', how: '↑ thinner · → resonance' },   // drums (the kick goes first)
      { k: 'delay', chip: '⋯ delay', how: '↑ more echo · → longer tail' },  // saw lead
    ];
    const lpF = y => 12000 * Math.pow(160 / 12000, y), hpF = y => 40 * Math.pow(5000 / 40, y), Q = x => 0.7 + x * 14;
    const toneF = x => 700 * Math.pow(16000 / 700, x), driveK = y => 1 + y * 50, gateDepth = y => 0.5 + 0.5 * y;
    const curves = new Map();
    const curve = k => { k = Math.round(k); if (!curves.has(k)) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } curves.set(k, c); } return curves.get(k); };
    const show = (i, a) => {
      const k = FX[i].k;
      if (k === 'lp') return `${hz(lpF(a.y))} · res ${pct(a.x)}`;
      if (k === 'hp') return `${hz(hpF(a.y))} · res ${pct(a.x)}`;
      if (k === 'drive') return `drive ${pct(a.y)} · tone ${hz(toneF(a.x))}`;
      if (k === 'gate') return `${gateOf(a.x)[1]} · ${pct(gateDepth(a.y))}`;
      return `echo ${pct(a.y)} · tail ${pct(a.x)}`;
    };
    const st = { on: [1, 1, 1, 1, 1], at: [null, null, null, null, null], lock: [0, 0, 0, 0, 0] };
    const grid = el('div', 'cpads'); box.body.appendChild(grid);
    const pads = BASE.map((key, i) => {
      const tile = el('div', 'ctile'); tile.tabIndex = 0; tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', INST[key].name + ': tap to turn on or off, hold and drag across the grid for ' + FX[i].chip.slice(2));
      tile.style.setProperty('--c', COL[i]); tile.dataset.grab = '';
      const head = el('div', 'chead');
      head.appendChild(el('span', 'badge' + (i === 3 ? ' dark' : ''), String(i + 1))).style.background = COL[i];
      head.appendChild(el('span', 'cname', INST[key].name));
      const state = el('span', 'cstate', 'on'); head.appendChild(state);
      tile.appendChild(head);
      const cv = canvas(tile, 'cstrip');
      const pad = el('div', 'cgridpad', `<span class="cchip">${FX[i].chip}</span><i class="cxl"></i><i class="cyl"></i><i class="cdot"></i>`);
      const how = el('span', 'chow', FX[i].how); pad.appendChild(how);
      tile.appendChild(pad);
      grid.appendChild(tile);

      const where = e => { const r = pad.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) }; };
      const cross = (a, cls) => { pad.style.setProperty('--x', (a.x * 100) + '%'); pad.style.setProperty('--y', ((1 - a.y) * 100) + '%'); tile.classList.toggle('hover', cls === 'hover'); };
      let t = null;
      const arm = e => { clearTimeout(t.still); t.sx = e.clientX; t.sy = e.clientY; tile.classList.remove('arming'); void tile.offsetWidth; tile.classList.add('arming');
        t.still = setTimeout(() => { if (t && t.active) { st.lock[i] = 1; tile.classList.remove('arming'); apply(); } }, 1200); };
      const start = e => { if (!t || t.active) return; t.active = true; tile.classList.add('touch'); move(e); arm(e); };
      const move = e => { if (st.lock[i]) return;   /* a locked effect stays put */ const a = where(e); st.at[i] = a; cross(a); apply(); if (t && t.active && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 6) arm(e); };
      tile.addEventListener('pointerdown', e => {
        if (t || e.button > 0) return; e.preventDefault(); tile.setPointerCapture(e.pointerId);
        t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: false, last: e, sx: e.clientX, sy: e.clientY };
        t.timer = setTimeout(() => start(t.last), 200);   // holding still also starts the effect
      });
      tile.addEventListener('pointermove', e => {
        if (!t) { if (e.pointerType === 'mouse' && !st.lock[i]) cross(where(e), 'hover'); return; }   // the cross follows your mouse over the grid
        if (t.id !== e.pointerId) return; t.last = e;
        if (!t.active && Math.hypot(e.clientX - t.x0, e.clientY - t.y0) > 10) start(e);
        if (t.active) move(e);
      });
      const end = e => {
        if (!t || t.id !== e.pointerId) return;
        clearTimeout(t.timer); clearTimeout(t.still); tile.classList.remove('arming', 'touch');
        if (t.active) { if (!st.lock[i]) st.at[i] = null; }   // springs back, unless locked
        else if (e.type === 'pointerup') { if (st.lock[i]) { st.lock[i] = 0; st.at[i] = null; } else st.on[i] ^= 1; }   // a tap
        t = null; apply();
      };
      tile.addEventListener('pointerup', end); tile.addEventListener('pointercancel', end);
      tile.addEventListener('pointerleave', () => { if (!t) tile.classList.remove('hover'); });
      tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.on[i] ^= 1; apply(); } });
      tile.addEventListener('contextmenu', e => e.preventDefault());
      return { tile, pad, how, state, cv, cross };
    });
    const prog = el('div', 'cprog', '<i></i>'); box.body.appendChild(prog);

    function apply() {
      pads.forEach((p, i) => {
        const a = st.at[i];
        p.tile.classList.toggle('off', !st.on[i]); p.tile.classList.toggle('locked', !!st.lock[i]); p.tile.classList.toggle('fx', !!a);
        p.state.textContent = st.lock[i] ? 'locked' : st.on[i] ? 'on' : 'off';
        p.how.textContent = a ? show(i, a) : FX[i].how;
        if (a) p.cross(a);
      });
      if (box.ch) {
        const L = box.ch.lanes, A = st.at;
        BASE.forEach((_, i) => level(L[i].vol.gain, st.on[i] ? MIX[i] : 0));
        level(L[0].lp.frequency, A[0] ? lpF(A[0].y) : 20000); level(L[0].lp.Q, A[0] ? Q(A[0].x) : 0.7);
        const k = A[1] ? driveK(A[1].y) : 0, bass = L[1];
        if (Math.round(k) !== (bass.k || 0)) { bass.sh.curve = k ? curve(k) : null; bass.k = Math.round(k); }
        level(bass.drv.gain, A[1] ? 1 / (1 + A[1].y * 11) : 1); level(bass.lp.frequency, A[1] ? toneF(A[1].x) : 20000);
        level(L[3].hp.frequency, A[3] ? hpF(A[3].y) : 10); level(L[3].hp.Q, A[3] ? Q(A[3].x) : 0.7);
        level(L[4].dly.gain, A[4] ? 0.15 + A[4].y * 1.1 : 0); level(L[4].fb.gain, A[4] ? 0.25 + A[4].x * 0.55 : 0.42);
        level(L[2].rs.gain, A[2] ? 0.04 : REV[2]);   // a dry pad, so the reverb doesn't fill the gaps of the gate
        if (!A[2]) { const p = L[2].gate.gain; p.cancelScheduledValues(ctx.currentTime); p.setTargetAtTime(1, ctx.currentTime, 0.01); }
      }
      box.changed();
    }
    box.onChain = apply;
    // the gate chops the pad in time with the loop: x picks the note, y how deep
    box.tick = (b1, b2) => {
      const a = st.at[2]; if (!a || !box.ch) return;
      const p = box.ch.lanes[2].gate.gain, per = gateOf(a.x)[0], depth = gateDepth(a.y);
      for (let s = Math.ceil(b1 * per) / per; s < b2; s += 1 / per) { const t = Math.max(ctx.currentTime, ctxTime(s)); p.setValueAtTime(1, t); p.setValueAtTime(1 - depth, t + 0.5 / per * SEC); }
    };
    box.events = (b1, b2, emit) => SONG.forEach((list, i) => { if (st.on[i]) loopEvents(b1, b2, list, plain, (e, b) => emit(i, BASE[i], e.note, e.vel, b, e.dur)); });
    box.draw = beat => {
      const pos = mod(beat, LOOP);
      pads.forEach((p, i) => strip(p.cv, SONG[i], COL[i], pos, { range: RANGES[i], dim: !st.on[i] }));
      prog.firstChild.style.transform = `scaleX(${pos / LOOP})`;
    };
    box.isOriginal = () => st.on.every(Boolean) && !st.at.some(Boolean) && !st.lock.some(Boolean);
    box.reset = () => { st.on.fill(1); st.at.fill(null); st.lock.fill(0); apply(); };
  }

  /* ================= 4 · song: drag parts onto a tape that plays from part to part ================= */
  function songBox(box) {
    const MAX = 12, START = [0, 1, 2];
    let uid = 0; const block = p => ({ id: ++uid, p });
    const st = { order: START.map(block), origin: 0 };
    const total = () => st.order.length * LOOP;
    const where = beat => { const p = mod(beat - st.origin, total()); const k = Math.min(st.order.length - 1, Math.floor(p / LOOP)); return { k, off: p - k * LOOP }; };
    const keep = (k, off) => { st.origin = beatNow() - (k * LOOP + off); };
    // change the tape, and keep playing the same block at the same spot (from its start if it went)
    function edit(fn) {
      const w = where(beatNow()), cur = st.order[w.k];
      fn();
      let k = st.order.indexOf(cur), off = w.off;
      if (k < 0) { k = Math.min(w.k, st.order.length - 1); off = 0; hush(box); box.sched = null; }
      keep(k, off); renderTape(); box.changed();
    }

    const view = el('div', 'sview'); box.body.appendChild(view);
    const vhead = el('div', 'svhead'); const badge = el('span', 'badge'), pname = el('span', 'spname'), pinfo = el('span', 'spinfo');
    vhead.append(badge, pname, pinfo); view.appendChild(vhead);
    const cv = canvas(view, 'sroll', 'Notes of the part that is playing');
    const tape = el('div', 'stape'); view.appendChild(tape);
    const shelf = el('div', 'sparts'); box.body.appendChild(shelf);

    /* drag and drop: a part from the shelf onto the tape, a block along the tape, or a block off the tape to take it away */
    let drag = null;
    const gap = el('div', 'sgap');
    function slotAt(x) {   // where on the tape a drop at x lands
      const blocks = [...tape.querySelectorAll('.sblock:not(.lifted)')];
      const r = tape.getBoundingClientRect(), bw = (blocks[0] ? blocks[0].offsetWidth : 96) + 6;
      return clamp(Math.round((x - r.left + tape.scrollLeft - bw / 2) / bw + 0.5), 0, blocks.length);
    }
    const overTape = (x, y) => { const r = view.getBoundingClientRect(); return x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 30 && y <= r.bottom + 30; };
    function draggable(node, kind, ref) {
      node.dataset.grab = '';
      node.addEventListener('pointerdown', e => {
        if (drag || e.button > 0 || e.target.closest('.sx')) return;
        node.setPointerCapture(e.pointerId);
        drag = { id: e.pointerId, kind, ref, node, x0: e.clientX, y0: e.clientY, on: false };
      });
      node.addEventListener('pointermove', e => {
        if (!drag || drag.id !== e.pointerId) return;
        if (!drag.on) {
          if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
          if (kind === 'part' && st.order.length >= MAX) return;
          drag.on = true;
          const P = PARTS[kind === 'part' ? ref : ref.p];
          drag.ghost = el('div', 'sghost', `<b>${P.letter}</b><span>${P.name}</span>`); drag.ghost.style.setProperty('--c', P.color);
          document.body.appendChild(drag.ghost);
          if (kind === 'block') { node.classList.add('lifted'); tape.classList.add('dragging'); }
          box.host.classList.add('sdragging');
        }
        drag.ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
        const inside = overTape(e.clientX, e.clientY);
        drag.ghost.classList.toggle('away', kind === 'block' && !inside && st.order.length > 1);
        if (inside) {
          const s = slotAt(e.clientX), rest = [...tape.querySelectorAll('.sblock:not(.lifted)')];
          tape.insertBefore(gap, rest[s] || tape.querySelector('.sdrop') || null); drag.slot = s;
          const r = tape.getBoundingClientRect();   // near an edge: the tape scrolls along
          if (e.clientX > r.right - 30) tape.scrollLeft += 10; else if (e.clientX < r.left + 30) tape.scrollLeft -= 10;
        } else { gap.remove(); drag.slot = null; }
      });
      const end = e => {
        if (!drag || drag.id !== e.pointerId) return;
        const d = drag; drag = null; gap.remove();
        box.host.classList.remove('sdragging'); tape.classList.remove('dragging');
        if (d.ghost) d.ghost.remove();
        if (d.node) d.node.classList.remove('lifted');
        if (e.type === 'pointercancel') return;
        if (!d.on) {   // a tap: a block plays from there, a part goes on the end
          if (kind === 'block') { st.origin = beatNow() - st.order.indexOf(ref) * LOOP; hush(box); box.sched = null; renderTape(); }
          else if (st.order.length < MAX) { edit(() => st.order.push(block(ref))); requestAnimationFrame(() => { tape.scrollLeft = tape.scrollWidth; }); }
          return;
        }
        if (d.slot != null) edit(() => {
          if (kind === 'part') st.order.splice(d.slot, 0, block(ref));
          else { st.order.splice(st.order.indexOf(ref), 1); st.order.splice(d.slot, 0, ref); }
        });
        else if (kind === 'block' && st.order.length > 1) edit(() => st.order.splice(st.order.indexOf(ref), 1));   // dropped off the tape
      };
      node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
    }

    PARTS.forEach((P, pi) => {
      const b = button('spart', '', 'Part ' + P.letter + ', ' + P.name + ': drag it onto the tape');
      b.innerHTML = `<b style="color:${P.color}">${P.letter}</b><span class="sbars">${P.on.map((on, i) => `<i style="background:${on ? COL[i] : '#bdbdb7'}"></i>`).join('')}</span><span>${P.name}</span>`;
      b.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && st.order.length < MAX) { e.preventDefault(); edit(() => st.order.push(block(pi))); } });
      draggable(b, 'part', pi);
      shelf.appendChild(b);
    });

    let blocks = [], shown = -1;
    function renderTape() {
      tape.querySelectorAll('.sblock,.sdrop').forEach(n => n.remove()); shown = -1;
      blocks = st.order.map((b, j) => {
        const P = PARTS[b.p], blk = el('div', 'sblock'); blk.style.setProperty('--c', P.color);
        blk.setAttribute('role', 'button'); blk.tabIndex = 0; blk.setAttribute('aria-label', 'Block ' + (j + 1) + ', ' + P.name + ': tap to play from here, drag to move');
        blk.innerHTML = `<b>${P.letter}</b><span>${P.name}</span>`;
        blk.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); st.origin = beatNow() - st.order.indexOf(b) * LOOP; hush(box); box.sched = null; } });
        if (st.order.length > 1) {
          const x = button('sx', '×', 'Take block ' + (j + 1) + ' off the tape');
          x.addEventListener('click', () => edit(() => st.order.splice(st.order.indexOf(b), 1)));
          blk.appendChild(x);
        }
        blk.appendChild(el('i', 'sprog'));
        draggable(blk, 'block', b);
        tape.appendChild(blk); return blk;
      });
      if (st.order.length < MAX) tape.appendChild(el('div', 'sdrop', 'drag a part here'));
      const secs = Math.round(total() * SEC);
      box.info.textContent = `${st.order.length} ${st.order.length === 1 ? 'pass' : 'passes'} · ${st.order.length * 4} bars · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    }
    renderTape();

    box.events = (b1, b2, emit) => {
      for (let b = b1; b < b2 - 1e-9;) {
        const w = where(b), start = b - w.off, segEnd = Math.min(b2, start + LOOP), P = PARTS[st.order[w.k].p];
        SONG.forEach((list, i) => { if (P.on[i]) for (const e of list) { const ab = start + e.beat; if (ab >= b && ab < segEnd) emit(i, BASE[i], e.note, e.vel, ab, e.dur); } });
        b = segEnd;
      }
    };
    box.draw = beat => {
      const w = where(beat), P = PARTS[st.order[w.k].p];
      if (shown !== w.k) {
        blocks.forEach((b, j) => b.classList.toggle('cur', j === w.k)); shown = w.k;
        badge.textContent = P.letter; badge.style.background = P.color; pname.textContent = P.name;
        const cur = blocks[w.k]; if (cur && !drag && tape.scrollWidth > tape.clientWidth) tape.scrollTo({ left: cur.offsetLeft - tape.clientWidth / 2 + cur.offsetWidth / 2, behavior: 'smooth' });
      }
      const at = Math.round((w.k * LOOP + w.off) * SEC), all = Math.round(total() * SEC), mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      pinfo.textContent = `pass ${w.k + 1} / ${st.order.length} · ${mmss(at)} / ${mmss(all)}`;
      if (blocks[w.k]) blocks[w.k].querySelector('.sprog').style.transform = `scaleX(${w.off / LOOP})`;
      const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = cv.d || 1; if (W < 4) return;
      g.fillStyle = '#161615'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#262624'; for (let i = 1; i < 4; i++) g.fillRect(Math.round(i * W / 4), 0, d, H);
      const lane = H / 5;
      SONG.forEach((list, i) => {
        const [lo, hi] = RANGES[i], nh = Math.max(2 * d, Math.min(3 * d, lane / 8)), y0 = i * lane + 4 * d, span = lane - 8 * d - nh;
        g.fillStyle = P.on[i] ? COL[i] : '#3a3a37'; g.globalAlpha = P.on[i] ? 1 : 0.5;
        for (const e of list) g.fillRect(e.beat / LOOP * W, y0 + (hi === lo ? span / 2 : (hi - e.note) / (hi - lo) * span), Math.max(2 * d, e.dur / LOOP * W - d), nh);
      });
      g.globalAlpha = 1; g.fillStyle = '#ff5000'; g.fillRect(Math.round(w.off / LOOP * W), 0, 2 * d, H);
    };
    box.isOriginal = () => st.order.length === START.length && st.order.every((b, j) => b.p === START[j]);
    box.reset = () => { st.order = START.map(block); st.origin = beatNow(); hush(box); box.sched = null; renderTape(); box.changed(); tape.scrollLeft = 0; };
  }

  /* ---------- the boxes ---------- */
  const SPEC = {
    layers: { title: 'layers', hint: 'M mute · S solo · tap a sound to swap it', build: layersBox },
    editor: { title: '1 · electric piano', hint: 'drag a chord to move it · drag its edges to change where it starts and ends', build: editorBox },
    capture: { title: 'capture mode', hint: 'tap: on/off · hold and drag across the grid: effect · hold still: lock', build: captureBox },
    song: { title: 'song', hint: 'drag parts onto the tape · drag blocks to move them, or off the tape to remove · tap a block to go there', build: songBox },
  };
  const boxes = [];
  hosts.forEach(host => {
    const spec = SPEC[host.dataset.box]; if (!spec) return;
    host.innerHTML = ''; host.classList.add('ready', 'fb-' + host.dataset.box);
    const head = el('div', 'fb-head'), titles = el('div', 'fb-titles');
    titles.append(el('span', 'fb-title', spec.title)); const info = el('span', 'fb-info'); titles.append(info);
    const orig = button('fb-orig', ICON_ORIG + '<span>original</span>', 'Back to the original');
    head.append(titles, orig);
    const body = el('div', 'fb-body');
    const foot = el('div', 'fb-foot'), mute = button('fb-mute', ICON_MUTE);
    foot.append(el('span', 'fb-hint', spec.hint), mute);
    host.append(head, body, foot);
    const box = { host, name: host.dataset.box, body, info, orig, mute, voices: new Set(), sched: null, ch: null, handMuted: false, seen: false };
    box.changed = () => { orig.disabled = !!(box.isOriginal && box.isOriginal()); };
    spec.build(box);
    box.changed();
    orig.addEventListener('click', () => { box.reset(); box.changed(); });
    mute.addEventListener('click', () => { audio(); setLoud(box, loud !== box, true); });
    setLoud(box, false);
    boxes.push(box);
  });

  function setLoud(box, on, byHand) {
    if (on) {
      if (loud && loud !== box) setLoud(loud, false);
      boxes.forEach(b => { b.handMuted = false; });   // moving on to this box forgets a hand mute elsewhere
      loud = box; box.sched = null;
      const demo = document.getElementById('demo'); if (demo && !demo.muted) demo.muted = true;   // one sound at a time
      if (audio() && chain(box)) fade(box, 1);
    } else {
      if (loud === box) loud = null;
      box.handMuted = !!byHand;
      fade(box, 0);
    }
    pressed(box.mute, !on);
    box.mute.setAttribute('aria-label', (on ? 'Mute ' : 'Unmute ') + 'the ' + SPEC[box.name].title + ' demo');
    box.host.classList.toggle('loud', on);
  }

  // touching a box counts once it is clearly not the start of a scroll: held a moment or let go in place.
  // On the pads and the piano roll (which don't scroll the page) it counts at once.
  boxes.forEach(box => {
    let pending = null;
    const interact = () => { pending = null; audio(); if (loud !== box && !box.handMuted) setLoud(box, true); };
    const fromMute = e => box.mute.contains(e.target);
    box.host.addEventListener('pointerdown', e => {
      if (fromMute(e)) return;
      if (e.pointerType !== 'touch' || (e.target.closest && e.target.closest('[data-grab]'))) return interact();
      const id = e.pointerId, x = e.clientX, y = e.clientY;
      pending = { id, x, y, t: setTimeout(() => pending && pending.id === id && interact(), 140) };
    }, true);
    box.host.addEventListener('pointermove', e => { if (pending && pending.id === e.pointerId && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 10) { clearTimeout(pending.t); pending = null; } }, true);
    box.host.addEventListener('pointercancel', () => { if (pending) { clearTimeout(pending.t); pending = null; } }, true);
    box.host.addEventListener('pointerup', e => { if (pending && pending.id === e.pointerId) { clearTimeout(pending.t); interact(); } }, true);
    box.host.addEventListener('keydown', e => { if (!fromMute(e)) interact(); }, true);
    box.host.addEventListener('change', () => interact(), true);
    // phones only let sound start on a finger lift or a click: try again then
    ['pointerup', 'touchend', 'click'].forEach(t => box.host.addEventListener(t, () => { if (loud === box) audio(); }, true));
  });

  // in view: draw; mostly out of view: the sound goes, and only a touch brings it back
  const seen = new IntersectionObserver(es => es.forEach(e => {
    const box = boxes.find(b => b.host === e.target); if (!box) return;
    box.seen = e.intersectionRatio > 0;
    if (e.intersectionRatio < 0.35) { if (loud === box) setLoud(box, false); box.handMuted = false; }
  }), { threshold: [0, 0.35] });
  // fetch the instruments a little before the first box scrolls in
  const near = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { BASE.forEach(load); near.disconnect(); } }, { rootMargin: '900px 0px' });
  boxes.forEach(b => { seen.observe(b.host); near.observe(b.host); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && loud) setLoud(loud, false); });
  const demo = document.getElementById('demo');
  if (demo) demo.addEventListener('volumechange', () => { if (!demo.muted && demo.volume > 0 && loud) setLoud(loud, false); });

  (function frame() {
    const beat = beatNow();
    boxes.forEach(b => { if (b.seen) b.draw(beat); });
    requestAnimationFrame(frame);
  })();

  // for testing from the console
  window.__boxes = { boxes, get loud() { return loud && loud.name; }, get ctx() { return ctx; }, READY };
})();

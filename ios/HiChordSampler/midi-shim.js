// Web MIDI for WKWebView: navigator.requestMIDIAccess backed by CoreMIDI in MIDIBridge.swift.
// Native -> JS: window.__nativeMIDI.setPorts({inputs:[{id,name,manufacturer}], outputs:[...]})
//               window.__nativeMIDI.receive(id, [bytes])
// JS -> native: webkit.messageHandlers.midi.postMessage({cmd:'init'} | {cmd:'send', id, data:[bytes]})
(function () {
  'use strict';
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.midi;
  if (!handler) return;
  const post = (m) => handler.postMessage(m);

  class Emitter {
    constructor() { this._l = {}; }
    addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
    removeEventListener(t, f) { this._l[t] = (this._l[t] || []).filter((x) => x !== f); }
    _emit(t, e) {
      const h = this['on' + t];
      if (typeof h === 'function') { try { h.call(this, e); } catch (err) { console.error(err); } }
      (this._l[t] || []).forEach((f) => { try { f.call(this, e); } catch (err) { console.error(err); } });
    }
  }

  class MIDIPort extends Emitter {
    constructor(o, type) {
      super();
      this.id = o.id; this.name = o.name; this.manufacturer = o.manufacturer || ''; this.version = '';
      this.type = type; this.state = 'connected'; this.connection = 'open'; this.onstatechange = null;
    }
    open() { return Promise.resolve(this); }
    close() { return Promise.resolve(this); }
  }

  const DATA_LEN = (s) => {
    if (s < 0xC0 || (s >= 0xE0 && s < 0xF0)) return 2;
    if (s < 0xE0) return 1;
    if (s === 0xF1 || s === 0xF3) return 1;
    if (s === 0xF2) return 2;
    return 0;
  };

  class MIDIInput extends MIDIPort {
    constructor(o) { super(o, 'input'); this._h = null; this._sx = null; this._rs = 0; this._msg = []; }
    get onmidimessage() { return this._h; }
    set onmidimessage(f) { this._h = f; }
    _deliver(bytes) {
      const e = { data: new Uint8Array(bytes), timeStamp: performance.now(), receivedTime: performance.now(), target: this };
      if (typeof this._h === 'function') { try { this._h.call(this, e); } catch (err) { console.error(err); } }
      (this._l.midimessage || []).forEach((f) => { try { f.call(this, e); } catch (err) { console.error(err); } });
    }
    // CoreMIDI packets can hold several messages, running status, or a SysEx split over packets.
    _parse(bytes) {
      for (const b of bytes) {
        if (b >= 0xF8) { this._deliver([b]); continue; }             // real-time, may interleave
        if (b === 0xF0) { this._sx = [b]; continue; }
        if (this._sx) {
          if (b === 0xF7) { this._sx.push(b); this._deliver(this._sx); this._sx = null; continue; }
          if (b < 0x80) { this._sx.push(b); if (this._sx.length > 65536) this._sx = null; continue; }
          this._sx = null;                                             // aborted SysEx, fall through
        }
        if (b >= 0x80) {
          this._msg = [b];
          if (b < 0xF0) this._rs = b; else this._rs = 0;
          if (DATA_LEN(b) === 0) { this._deliver(this._msg); this._msg = []; }
          continue;
        }
        if (!this._msg.length) { if (!this._rs) continue; this._msg = [this._rs]; }
        this._msg.push(b);
        if (this._msg.length - 1 >= DATA_LEN(this._msg[0])) { this._deliver(this._msg); this._msg = []; }
      }
    }
  }

  class MIDIOutput extends MIDIPort {
    constructor(o) { super(o, 'output'); }
    send(data, timestamp) {
      if (this.state !== 'connected') throw new DOMException('Port is disconnected', 'InvalidStateError');
      const arr = Array.from(data, (x) => x & 0xFF);
      const go = () => post({ cmd: 'send', id: this.id, data: arr });
      const wait = timestamp ? timestamp - performance.now() : 0;
      if (wait > 1) setTimeout(go, wait); else go();
    }
    clear() {}
  }

  class MIDIAccess extends Emitter {
    constructor() { super(); this.inputs = new Map(); this.outputs = new Map(); this.sysexEnabled = true; this.onstatechange = null; }
  }

  const access = new MIDIAccess();
  let ready = false; const waiting = [];

  function sync(map, list, Cls) {
    const seen = new Set();
    const changed = [];
    for (const o of list) {
      seen.add(o.id);
      let p = map.get(o.id);
      if (!p) { p = new Cls(o); map.set(o.id, p); changed.push(p); }
      else if (p.state !== 'connected') { p.state = 'connected'; p.connection = 'open'; changed.push(p); }
    }
    for (const [id, p] of map) {
      if (!seen.has(id) && p.state !== 'disconnected') { p.state = 'disconnected'; p.connection = 'closed'; map.delete(id); changed.push(p); }
    }
    return changed;
  }

  window.__nativeMIDI = {
    setPorts(info) {
      const changed = sync(access.inputs, info.inputs || [], MIDIInput).concat(sync(access.outputs, info.outputs || [], MIDIOutput));
      if (!ready) { ready = true; waiting.splice(0).forEach((r) => r(access)); return; }
      changed.forEach((port) => { const e = { port, target: access }; port._emit('statechange', e); access._emit('statechange', e); });
    },
    receive(id, bytes) { const p = access.inputs.get(id); if (p) p._parse(bytes); },
  };

  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: function () {
      return new Promise((resolve) => { if (ready) resolve(access); else { waiting.push(resolve); post({ cmd: 'init' }); } });
    },
  });
  window.__isHiChordApp = true;
})();

# Usage: python synth_sounds.py <out dir>   (needs numpy, scipy)
"""Render the app's synth instruments from scratch: electric piano (FM), saw lead, square lead, pad and synth bass.

No samples and no third-party patches: every note is computed here (band-limited additive oscillators, a
filter applied per harmonic so the cutoff can move, simple envelopes), so the result is the project's own and
released with it as CC0. Writes <out>/<key>/<midi note>.wav (48 kHz, float, stereo) and <out>/synths.json,
a fragment for build_sounds.py's config."""
import numpy as np, json, os, sys
from scipy.io import wavfile
OUT=sys.argv[1]; sr=48000; rng=np.random.default_rng(7)
mtof=lambda n: 440*2**((n-69)/12)

def voice(f0, dur, wave='saw', detune=0.0, cutoff=lambda t: 4000+0*t, vib=(0,0,0), level=1.0):
    """one oscillator: f0 Hz, detune in cents, cutoff(t) in Hz (2-pole response per harmonic), vibrato (depth cents, rate Hz, delay s)"""
    t=np.arange(int(dur*sr))/sr
    d,rate,delay=vib; depth=d*np.clip((t-delay)/0.4,0,1)
    f=f0*2**((detune+depth*np.sin(2*np.pi*rate*t))/1200)
    ph=2*np.pi*np.cumsum(f)/sr + rng.uniform(0,2*np.pi)
    fc=np.maximum(cutoff(t),40.0); y=np.zeros_like(t)
    K=int(min(18000, sr/2-2000)/f0)
    for k in range(1,K+1):
        if wave=='square' and k%2==0: continue
        amp=1.0/k
        h=1/np.sqrt(1+(k*f/fc)**4)   # 12 dB/octave low-pass, evaluated where this harmonic is right now
        y+=amp*h*np.sin(k*ph)
    return y*level
def env(t, a, level_end=1.0, d=0.0):
    e=np.clip(t/a,0,1) if a>0 else np.ones_like(t)
    if d>0: e=e*(level_end+(1-level_end)*np.exp(-t/d))
    return e
def stereo(l,r): return np.stack([l,r],axis=1).astype(np.float32)

def saw_lead(n, dur=2.0):
    f=mtof(n); t=np.arange(int(dur*sr))/sr
    cut=lambda t: np.minimum(9000, f*6)+1800*np.exp(-t/0.25)
    vs=[voice(f,dur,'saw',c,cut,(10,5.2,0.5)) for c in (-7,0,7)]
    y=(vs[0]+vs[1]+vs[2])/3*env(t,0.006)
    return stereo(y*0.9+vs[0]*0.1, y*0.9+vs[2]*0.1)
def square_lead(n, dur=2.0):
    f=mtof(n); t=np.arange(int(dur*sr))/sr
    cut=lambda t: np.minimum(10000, f*8)+0*t
    a=voice(f,dur,'square',-4,cut,(8,5.5,0.6)); b=voice(f,dur,'square',4,cut,(8,5.5,0.6))
    e=env(t,0.004)
    return stereo((0.75*a+0.25*b)*e, (0.25*a+0.75*b)*e)
def pad(n, dur=2.2):
    f=mtof(n); t=np.arange(int(dur*sr))/sr
    cut=lambda t: np.minimum(3500, f*4)*(0.6+0.4*np.clip(t/0.8,0,1))
    L=sum(voice(f,dur,'saw',c,cut) for c in (-14,-5,9))/3; R=sum(voice(f,dur,'saw',c,cut) for c in (-9,4,13))/3
    sub=voice(f/2,dur,'square',0,lambda t: f*1.5+0*t,level=0.35)
    e=env(t,0.35)
    return stereo((L+sub)*e, (R+sub)*e)
def synth_bass(n, dur=2.0):
    f=mtof(n); t=np.arange(int(dur*sr))/sr
    cut=lambda t: f*2.5+2200*np.exp(-t/0.12)
    y=voice(f,dur,'saw',0,cut)+voice(f/2,dur,'square',0,lambda t: f*1.2+0*t,level=0.6)
    y=y*env(t,0.003)
    return stereo(y,y)

def epiano(n, dur=2.4):
    # two-operator FM, like a tine electric piano: a 1:1 pair for the body (its brightness fading out) and a
    # 1:14 pair for the bell-like 'tine' at the start; louder notes decay faster up high
    f=mtof(n); t=np.arange(int(dur*sr))/sr; tau=np.interp(n,[36,96],[2.2,0.7])
    out=[]
    for c in (-2.5,2.5):   # a slightly different copy left and right
        fc=f*2**(c/1200); ph=rng.uniform(0,2*np.pi)
        i1=1.6*np.exp(-t/0.45)+0.35; body=np.sin(2*np.pi*fc*t+ph+i1*np.sin(2*np.pi*fc*t))
        i2=1.1*np.exp(-t/0.05); tine=np.sin(2*np.pi*fc*t+i2*np.sin(2*np.pi*fc*14*t))
        e=np.clip(t/0.002,0,1)*np.exp(-t/tau)
        out.append((0.8*body+0.35*tine*np.exp(-t/0.25))*e*(1+0.04*np.sin(2*np.pi*4.5*t)))
    return stereo(*out)

PATCHES=[('keys','Electric piano',epiano,range(36,106,3),None),('lead','Saw lead',saw_lead,range(36,106,3),[0.7,1.7]),
         ('square','Square lead',square_lead,range(36,106,3),[0.7,1.7]),
         ('pad','Pad',pad,range(36,106,3),[0.9,1.9]),
         ('bass','Synth bass',synth_bass,range(36,82,3),[0.9,1.9])]
frag=[]
for key,name,fn,notes,loop in PATCHES:
    os.makedirs(f"{OUT}/{key}",exist_ok=True); ns=[]
    for n in notes:
        y=fn(n); y=y/max(1e-9,np.abs(y).max())*0.8
        p=f"{OUT}/{key}/{n}.wav"; wavfile.write(p,sr,y); ns.append({'note':n,'file':os.path.abspath(p)})
    if loop is None: frag.append({'key':key,'name':name,'kind':'decay','stereo':True,'len':2.4,'notes':ns})
    else: frag.append({'key':key,'name':name,'kind':'sustain','stereo':key!='bass' and key!='lead','len':2.0 if key!='pad' else 2.1,'loop':loop,'notes':ns})
    print(key, len(ns), 'notes')
json.dump(frag, open(f"{OUT}/synths.json",'w'), indent=1)

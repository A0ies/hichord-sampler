# Usage: python build_sounds.py <config.json> <sounds dir> <temp dir>   (needs numpy, scipy and macOS afconvert)
"""Pack per-note sample files into the app's instruments.

config.json (paths relative to the config file):
  {"instruments": [
     {"key": "piano", "name": "Grand piano", "kind": "decay" | "sustain", "stereo": true,
      "len": 1.95,                 # seconds kept per note
      "loop": [0.6, 1.5],          # sustain only: loop start, and the latest loop end (seconds into the note)
      "even": true,                # optional: bring every note to the same loudness first (sets from mixed sources)
      "notes": [{"note": 36, "file": "...", "gain_db": 0, "skip": 0.0}, ...]}],
   "drums": [{"name": "kick", "file": "...", "len": 1.0, "gain_db": 0}, ...]}   # in the app's order

Every instrument becomes sounds/<key>.m4a (AAC) with the notes one after another, and sounds/sounds.json says
where each note starts and, for sustained sounds, where its loop is. One gain per instrument: the middle notes
at about -16 dBFS RMS, peaks below -1 dBFS. A note every 3 semitones is what the app expects (it shifts a played
note by at most a semitone and a half), but any spacing works."""
import numpy as np, json, os, subprocess, sys, hashlib, warnings
warnings.simplefilter('ignore')
from scipy.io import wavfile
CFG=sys.argv[1]; OUT=sys.argv[2]; TMP=sys.argv[3]; sr=48000
os.makedirs(OUT,exist_ok=True); os.makedirs(TMP,exist_ok=True)
cfg=json.load(open(CFG)); BASE=os.path.dirname(os.path.abspath(CFG))
PRE=0.05   # silence before each note in the packed file

def read(path):
    """any file CoreAudio can decode (wav, aiff, flac, caf, m4a) -> float32 (n, 2) at 48 kHz"""
    p=path if os.path.isabs(path) else os.path.join(BASE,path)
    tmp=os.path.join(TMP,'dec_'+hashlib.md5(p.encode()).hexdigest()+'.wav')
    if not os.path.exists(tmp):
        subprocess.run(['afconvert','-f','WAVE','-d',f'LEF32@{sr}',p,tmp],check=True,capture_output=True)
    r,x=wavfile.read(tmp); x=x.astype(np.float32)
    if x.ndim==1: x=x[:,None]
    if x.shape[1]==1: x=np.repeat(x,2,axis=1)
    return x[:,:2]
def onset(m):
    seg=np.abs(m); pk=seg.max(); thr=max(pk*10**(-40/20), 10**(-66/20))
    return int(np.argmax(seg>thr))
def best_loop_end(m, ls, le_lo, le_hi, win):
    # the loop end whose following samples look most like the samples after the loop start
    ref=m[ls:ls+win]; best=None
    for le in range(le_lo, min(le_hi, len(m)-win), 16):
        c=m[le:le+win]; s=np.dot(ref,c)/(np.linalg.norm(ref)*np.linalg.norm(c)+1e-12)
        if best is None or s>best[0]: best=(s,le)
    return best[1], best[0]
def bake_loop(y, ls, le, xf):
    # crossfade the end of the loop into the audio just before its start, so le -> ls is seamless
    w=np.sin(np.linspace(0,np.pi/2,xf))**2
    y[le-xf:le]=y[le-xf:le]*np.sqrt(1-w)[:,None]+y[ls-xf:ls]*np.sqrt(w)[:,None]
def encode(path_wav, path_out, stereo):
    subprocess.run(['afconvert','-f','m4af','-d','aac','-b','128000' if stereo else '80000','-q','127',path_wav,path_out],check=True)
def pack(ys, stereo):
    ch=2 if stereo else 1
    slot=max(len(y) for y in ys)/sr+PRE+0.05
    out=np.zeros((int(np.ceil(slot*len(ys)*sr))+sr//10, ch),np.float32); starts=[]
    for i,y in enumerate(ys):
        s=int(round((i*slot+PRE)*sr)); out[s:s+len(y)]=y[:,:2] if ch==2 else y.mean(axis=1,keepdims=True); starts.append(round(i*slot+PRE,5))
    return out, starts

man={}
for ins in cfg['instruments']:
    key,kind,L=ins['key'],ins['kind'],ins['len']; notes=[]; ys=[]
    for n in ins['notes']:
        x=read(n['file'])*10**(n.get('gain_db',0)/20)
        a=int(n.get('skip',0)*sr); o=max(0,a+onset(x[a:].mean(axis=1))-int(0.001*sr))
        y=x[o:o+int(L*sr)].copy()
        if len(y)<int(L*sr): y=np.concatenate([y,np.zeros((int(L*sr)-len(y),2),np.float32)])
        z={'note':n['note']}
        if kind=='sustain':
            m=y.mean(axis=1); ls=int(ins['loop'][0]*sr)
            le,score=best_loop_end(m, ls, ls+int(0.35*sr), int(ins['loop'][1]*sr), int(0.06*sr))
            bake_loop(y, ls, le, int(0.12*sr))
            # after the loop end, carry on with what follows the loop start: the file stays continuous there
            y=np.concatenate([y[:le], y[ls:ls+int(0.25*sr)]])
            z['loop']=[ls/sr, le/sr]; z['score']=round(float(score),3)
        f=int(0.03*sr); y[-f:]*=np.linspace(1,0,f)[:,None]
        if ins.get('even'): y=y*(0.1/max(1e-6,np.sqrt(np.mean(y[:int(0.6*sr)]**2))))
        notes.append(z); ys.append(y)
    mid=[y[:int(0.8*sr)] for y in ys[len(ys)//3:max(len(ys)//3+1,2*len(ys)//3)]]
    rms=np.sqrt(np.mean(np.concatenate(mid)**2)); peak=max(np.abs(y).max() for y in ys)
    g=min(10**(-16/20)/rms, 10**(-1/20)/peak)
    data,starts=pack([y*g for y in ys], ins.get('stereo',True))
    for z,s,y in zip(notes,starts,ys):
        z['start']=s; z['len']=round(len(y)/sr,4)
        if 'loop' in z: z['loop']=[round(s+z['loop'][0],5), round(s+z['loop'][1],5)]
    probe=int(np.argmax(np.abs(data).max(axis=1)>0.01))/sr   # where the first sound starts (the app corrects the codec's delay with it)
    wav=f"{TMP}/{key}.wav"; wavfile.write(wav, sr, data); encode(wav, f"{OUT}/{key}.m4a", data.shape[1]==2)
    man[key]={'name':ins['name'],'kind':kind,'probe':round(probe,5),'gain_db':round(float(20*np.log10(g)),1),'zones':notes}
    print(f"{key:8s} {len(ys):2d} notes {notes[0]['note']}-{notes[-1]['note']}  gain {20*np.log10(g):+5.1f} dB  {os.path.getsize(f'{OUT}/{key}.m4a')/1e6:.2f} MB  loops {[z.get('score') for z in notes][:8] if kind=='sustain' else ''}")
if cfg.get('drums'):
    ys=[]; zones=[]
    for h in cfg['drums']:
        x=read(h['file']).mean(axis=1)*10**(h.get('gain_db',0)/20); o=max(0,onset(x)-int(0.001*sr))
        y=x[o:o+int(h.get('len',1.0)*sr)]
        last=np.nonzero(np.abs(y)>10**(-70/20))[0][-1]; y=y[:last+int(0.01*sr)].copy()
        f=int(0.01*sr); y[-f:]*=np.linspace(1,0,f); ys.append(y[:,None])
    g=10**(-1/20)/max(np.abs(y).max() for y in ys)
    data,starts=pack([y*g for y in ys], False)
    for h,s,y in zip(cfg['drums'],starts,ys): zones.append({'name':h['name'],'start':s,'len':round(len(y)/sr,4)})
    probe=int(np.argmax(np.abs(data[:,0])>0.01))/sr
    wavfile.write(f"{TMP}/drums.wav",sr,data); encode(f"{TMP}/drums.wav",f"{OUT}/drums.m4a",False)
    man['drums']={'name':'Drums','kind':'kit','probe':round(probe,5),'gain_db':round(float(20*np.log10(g)),1),'zones':zones}
    print('drums', [(z['name'],z['len']) for z in zones], f"{os.path.getsize(f'{OUT}/drums.m4a')/1e6:.2f} MB")
# keep instruments this config doesn't build
old=os.path.join(OUT,'sounds.json')
if os.path.exists(old):
    prev=json.load(open(old)); prev.update(man); man=prev
json.dump(man, open(old,'w'), separators=(',',':'))

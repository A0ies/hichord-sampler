# Usage: python build_sounds.py <export.npy from the Ableton WAV> <sounds dir> <temp dir>   (needs numpy, scipy, macOS afconvert)
"""Slice 'App sounds.wav' into packed multisample files for the app."""
import numpy as np, json, os, subprocess, sys
from scipy.io import wavfile
x=np.load(sys.argv[1]); OUT=sys.argv[2]; TMP=sys.argv[3]; sr=48000
os.makedirs(OUT,exist_ok=True); os.makedirs(TMP,exist_ok=True)
PRE=0.05   # silence before each note in the packed file
# key, name, first slot time, slot step, slots used (k range), first played note, stereo, kind, length, loop window
I=[
 ('piano','Grand piano',   0,2, range(0,24), 'stereo','decay',  1.95,None),
 ('strings','Strings',     50,2, range(7,21), 'stereo','sustain',1.75,(0.75,1.70)),
 ('horns','Horns',       100,2, range(0,14), 'stereo','sustain',1.75,(0.75,1.70)),
 ('keys', 'Rhodes',      150,2, range(0,24), 'stereo','sustain',1.75,(1.00,1.70)),
 ('guitar','Electric guitar',200,2,range(0,24),'mono','decay',   1.95,None),
 ('lead', 'Saw lead',    250,2, range(0,24), 'mono',  'sustain',1.75,(0.70,1.70)),
 ('square','Square lead',300,2, range(0,24), 'stereo','sustain',1.75,(0.70,1.70)),
 ('pad',  'Pad',         350,2, range(0,24), 'stereo','sustain',1.75,(0.70,1.70)),
 ('ebass','Electric bass',400,4,range(0,14), 'mono',  'decay',  3.60,None),
 ('bass', 'Synth bass',  466,4, range(0,16), 'mono',  'sustain',2.00,(0.90,1.90)),
]
def onset(a, b, ch):
    seg=np.abs(ch[a:b]); pk=seg.max(); thr=max(pk*10**(-40/20), 10**(-66/20))
    return a+int(np.argmax(seg>thr)), pk
def best_loop_end(m, ls, le_lo, le_hi, win):
    # pick the loop end whose following samples look most like the samples after the loop start
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
man={}
for key,name,T,step,ks,stmode,kind,L,loop in I:
    notes=[]; ys=[]
    for k in ks:
        a=int((T+k*step)*sr); mono=x[:,0]+x[:,1]
        o,pk=onset(a, a+int(0.5*sr), mono); o=max(a, o-int(0.001*sr))
        y=x[o:o+int(L*sr)].copy()
        if stmode=='mono': y=np.repeat(y.mean(axis=1,keepdims=True),1,axis=1)
        z={'note':36+3*k}
        if kind=='sustain':
            m=y.mean(axis=1); ls=int(loop[0]*sr)
            le,score=best_loop_end(m, ls, ls+int(0.45*sr), int(loop[1]*sr), int(0.06*sr))
            bake_loop(y, ls, le, int(0.12*sr))
            # after the loop end, carry on with what follows the loop start: the file stays continuous there, so the codec can't smear a jump into the loop
            y=np.concatenate([y[:le], y[ls:ls+int(0.25*sr)]])
            z['loop']=[ls/sr, le/sr]; z['score']=round(float(score),3)
        f=int(0.03*sr); y[-f:]*=np.linspace(1,0,f)[:,None]
        notes.append(z); ys.append(y)
    # one gain for the whole instrument: loudness of the middle notes to about -16 dBFS RMS, peaks below -1 dBFS
    mid=[y[:int(0.8*sr)] for y in ys[len(ys)//3:2*len(ys)//3]]
    rms=np.sqrt(np.mean(np.concatenate(mid)**2)); peak=max(np.abs(y).max() for y in ys)
    g=min(10**(-16/20)/rms, 10**(-1/20)/peak)
    slot=max(len(y) for y in ys)/sr+PRE+0.05
    ch=1 if stmode=='mono' else 2
    pack=np.zeros((int(np.ceil(slot*len(ys)*sr))+sr//10, ch),np.float32)
    for i,(z,y) in enumerate(zip(notes,ys)):
        s=int(round((i*slot+PRE)*sr)); pack[s:s+len(y)]=(y[:,:ch] if ch==2 else y[:,:1])*g
        z['start']=round(i*slot+PRE,5); z['len']=round(len(y)/sr,4)
        if 'loop' in z: z['loop']=[round(z['start']+z['loop'][0],5), round(z['start']+z['loop'][1],5)]
    # where the first sound starts, so the app can correct for the codec's delay
    probe=int(np.argmax(np.abs(pack).max(axis=1)>0.01))/sr
    wav=f"{TMP}/{key}.wav"; wavfile.write(wav, sr, pack); encode(wav, f"{OUT}/{key}.m4a", ch==2)
    man[key]={'name':name,'kind':kind,'probe':round(probe,5),'gain_db':round(float(20*np.log10(g)),1),'zones':notes}
    print(f"{key:8s} {len(ys):2d} notes {notes[0]['note']}-{notes[-1]['note']}  gain {20*np.log10(g):+5.1f} dB  {os.path.getsize(f'{OUT}/{key}.m4a')/1e6:.2f} MB  loops {[z.get('score') for z in notes][:6] if kind=='sustain' else ''}")
# drums: one-shots
hits=[('kick',532,1.0),('snare',533,1.0),('hat',534,1.0),('openhat',535,1.0),('crash',536,1.95),('tom',538,1.0),('perc',539,1.0)]
ys=[]
for nm,t,maxl in hits:
    a=int(t*sr); mono=x[:,0]+x[:,1]; o,pk=onset(a,a+int(0.3*sr),mono); o=max(a,o-int(0.001*sr))
    y=x[o:o+int((maxl-0.06)*sr)].mean(axis=1)
    env=np.abs(y); last=np.nonzero(env>10**(-70/20))[0][-1]; y=y[:last+int(0.01*sr)]
    f=int(0.01*sr); y[-f:]*=np.linspace(1,0,f); ys.append(y)
g=10**(-1/20)/max(np.abs(y).max() for y in ys)
slot=max(len(y) for y in ys)/sr+PRE+0.05
pack=np.zeros((int(np.ceil(slot*len(ys)*sr))+sr//10,1),np.float32); zones=[]
for i,((nm,_,_),y) in enumerate(zip(hits,ys)):
    s=int(round((i*slot+PRE)*sr)); pack[s:s+len(y),0]=y*g; zones.append({'name':nm,'start':round(i*slot+PRE,5),'len':round(len(y)/sr,4)})
probe=int(np.argmax(np.abs(pack[:,0])>0.01))/sr
wavfile.write(f"{TMP}/drums.wav",sr,pack); encode(f"{TMP}/drums.wav",f"{OUT}/drums.m4a",False)
man['drums']={'name':'Drums','kind':'kit','probe':round(probe,5),'gain_db':round(float(20*np.log10(g)),1),'zones':zones}
print('drums', [(z['name'],z['len']) for z in zones], f"{os.path.getsize(f'{OUT}/drums.m4a')/1e6:.2f} MB")
json.dump(man, open(f"{OUT}/sounds.json",'w'), separators=(',',':'))

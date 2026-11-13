# Usage: python fetch_sources.py <sources dir>
"""Download just the sample files the app's instruments are built from, plus each project's own licence files,
into <sources dir>/<project>/ (keep that folder outside the app: only build_sounds.py's output goes in sounds/).
Every file comes from the project's own GitHub repository (raw.githubusercontent.com). Writes
<sources dir>/config.json for build_sounds.py, with the synths from synth_sounds.py added if it has run."""
import json, os, sys, subprocess, urllib.parse
OUT=sys.argv[1]
RAW='https://raw.githubusercontent.com'
NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
FLAT={'db':'c#','eb':'d#','gb':'f#','ab':'g#','bb':'a#'}
def midi(name, shift=0):   # 'D#4' -> 63 (C4 = 60); shift: the project names notes that many octaves off
    n=name[:-1].upper(); o=int(name[-1])
    return NAMES.index(n)+12*(o+1)+12*shift
def get(repo, branch, path, proj):
    d=os.path.join(OUT,proj); os.makedirs(d,exist_ok=True)
    dst=os.path.join(d, path.replace('/','__'))
    if not os.path.exists(dst):
        url=f"{RAW}/{repo}/{branch}/"+urllib.parse.quote(path)
        subprocess.run(['curl','-fsSL','--retry','5','--retry-all-errors','-o',dst+'.part',url],check=True)
        os.rename(dst+'.part',dst)
    return dst

S=('sfzinstruments/SalamanderGrandPiano','master'); V=('sgossner/VSCO-2-CE','master')
G=('freepats/electric-guitar-FSBS-clean','main'); B=('sfzinstruments/karoryfer.growlybass','master')
D=('sfzinstruments/virtuosity_drums','master')
for repo,br,files,proj in [(S,None,['LICENSE','README.md'],'salamander'),(V,None,['LICENSE','Readme.txt','README.md'],'vsco2ce'),
                           (G,None,['LICENSE.txt','README.txt'],'fsbs-clean'),(B,None,['LICENSE','readme.txt'],'growlybass'),(D,None,['LICENSE','README.md'],'virtuosity')]:
    for f in files: get(repo[0],repo[1],f,proj)

ins=[]
# grand piano: Salamander V3, velocity layer 8 (about mf); C, D#, F#, A in every octave = every 3 semitones
notes=[]
for n in range(36,106,3):
    nm=NAMES[n%12]+str(n//12-1)
    notes.append({'note':n,'file':get(*S,f'Samples/{nm}v8.flac','salamander')})
ins.append({'key':'piano','name':'Grand piano','kind':'decay','stereo':True,'len':1.95,'notes':notes})
# strings: VSCO 2 CE sections (names one octave low) from low to high, solo violin on top (standard names)
st=[('Strings/Cello Section/susvib/susvib_{}_v3_1.wav',['C1','E1','G1','B1','D2','F2'],1),
    ('Strings/Viola Section/susvib/ViolaEns_susvib_{}_v2_1.wav',['G2','B2','D3','F3'],1),
    ('Strings/Violin Section/susVib/VlnEns_susVib_{}_v2.wav',['A3','C4','E4','G4','B4','D5'],1),
    ('Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{}_f.wav',['E6','G6','A6','C7'],0)]
notes=[{'note':midi(nm,sh),'file':get(*V,pat.format(nm),'vsco2ce')} for pat,nms,sh in st for nm in nms]
ins.append({'key':'strings','name':'Strings','kind':'sustain','stereo':True,'len':2.0,'loop':[0.9,1.9],'even':True,'notes':notes})
# horn: VSCO 2 CE F horn sustain (names one octave low), layer 2 where there is one
hn=[('C1',2),('D#1',2),('G1',2),('A#1',2),('D2',2),('F2',2),('A2',2),('C3',2),('D4',1),('F4',1)]
notes=[{'note':midi(nm,1),'file':get(*V,f'Brass/F Horn/sus/MOHorn_sus_{nm}_v{v}_1.wav','vsco2ce')} for nm,v in hn]
ins.append({'key':'horns','name':'Horns','kind':'sustain','stereo':True,'len':2.0,'loop':[0.9,1.9],'even':True,'notes':notes})
# electric guitar: FreePats FSBS clean, bridge pickup, first round robin, normal velocity
gt=['C2_s1','E2_s1','F2_s1','A2_s2','C3_s2','D3_s3','E3_s3','G3_s4','B3_s5','C#4_s5','E4_s6','G4_s6','B4_s6','C5_s6','D5_s6','F5_s6','G#5_s6','A#5_s6','C#6_s6']
notes=[{'note':midi(x.split('_')[0]),'file':get(*G,f'samples/bridge/{x}_01.flac','fsbs-clean')} for x in gt]
ins.append({'key':'guitar','name':'Electric guitar','kind':'decay','stereo':True,'len':1.95,'even':True,'notes':notes})
# electric bass: Karoryfer Growlybass, soft layer, first round robin (mapped by the names, as its SFZ does)
bs=['db2','e2','gb2','a2','c3','eb3','gb3','a3','c4','eb4','gb4','a4','c5','eb5']
def bmidi(x): n=x[:-1]; n=FLAT.get(n,n); return midi(n.upper()+x[-1])
notes=[{'note':bmidi(x),'file':get(*B,f'sustain/{x}_p_rr1.wav','growlybass')} for x in bs]
ins.append({'key':'ebass','name':'Electric bass','kind':'decay','stereo':False,'len':3.6,'even':True,'notes':notes})
# drums: Virtuosity Drums, mid microphones; order = the app's: kick, snare, closed hat, open hat, crash, tom, percussion
dr=[('kick','Samples/mid/kick/mid_kick_snoff_vl3_rr1.flac',1.0),('snare','Samples/mid/snare/mid_snare_center_vl24.flac',1.0),
    ('hat','Samples/mid/hh/mid_hh_closed_vl3_rr1.flac',1.0),('openhat','Samples/mid/hh/mid_hh_open_vl3_rr1.flac',1.0),
    ('crash','Samples/mid/crash/mid_crash_crash_vl2_rr1.flac',1.95),('tom','Samples/mid/htom/mid_htom_center_vl10.flac',1.0),
    ('perc','Samples/perc/mid/cowbell/Cowbell1_Normal_v2_rr1_Mid.wav',1.0)]
drums=[{'name':n,'file':get(*D,p,'virtuosity'),'len':l} for n,p,l in dr]
syn=os.path.join(OUT,'synths','synths.json')
if os.path.exists(syn): ins+=json.load(open(syn))
json.dump({'instruments':ins,'drums':drums}, open(os.path.join(OUT,'config.json'),'w'), indent=1)
print('ok:', ', '.join(i['key'] for i in ins), '+ drums')

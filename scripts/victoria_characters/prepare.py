"""Export interchangeable Victoria 3 portrait parts and lobby idles (numpy, Pillow, scipy)."""
import argparse
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import struct

os.environ['OPENBLAS_NUM_THREADS']='1'
import numpy as np
from PIL import Image
from catalog import ROOT, definitions, blocks, val, write_json

CACHE=ROOT/'.cache/victoria-cast'
LIBRARY=ROOT/'artifacts/victoria-3-models/CharacterLibrary'
PDX=runpy.run_path(str(ROOT/'scripts/import-victoria-roster.py'))
read=PDX['read_pdx']
def slug(s):return hashlib.sha256(s.encode()).hexdigest()[:16]

class Baker:
    def __init__(self,installation,catalog):
        self.install=installation;self.game=installation/'game';self.por=self.game/'gfx/models/portraits';self.c=catalog
        self.base={};self.tex={};self.materials={};self.faces={};self.rigs={}
        self.cache=CACHE;self.cache.mkdir(parents=True,exist_ok=True)
        self.diffuse_by_name={p.name.lower():p for p in self.por.rglob('*diffuse.dds')}

    def rig(self,sex,kind):
        key=(sex,kind)
        if key in self.rigs:return self.rigs[key]
        stem=sex+'_'+kind;path=self.por/stem
        sh=read(path/(stem+'.mesh')).find('object')[0];bones=sorted(sh.find('skeleton'),key=lambda b:int(b.get('ix')[0]))
        info,frames,channels=PDX['decode_clip'](path/(stem+'_idle1_1.anim'))
        locals={}
        for b in info:
            data=[channels[b.tag,c][min(5,frames-1)] if (b.tag,c) in channels else b.get(c) for c in 'tqs']
            locals[b.tag.split(':')[-1]]=PDX['local_pose'](*data)
        poses={};bind=[]
        for i,b in enumerate(bones):
            name=b.tag.split(':')[-1];pa=int(b.get('pa',[-1])[0]);inv=np.vstack((b.get('tx').reshape(4,3).T,[0,0,0,1]));bind.append(np.linalg.inv(inv))
            local=locals.get(name,bind[i] if pa<0 else np.linalg.inv(bind[pa])@bind[i])
            poses[name]=local if pa<0 else poses[bones[pa].tag.split(':')[-1]]@local
        if kind=='head' and poses['head_root'][1,3]<60:
            # Some idle clips place the head rig relative to the thoracic attachment.
            mount=self.rig(sex,'body')['bn_sp_thoracic']
            poses={name:mount@matrix for name,matrix in poses.items()}
        self.rigs[key]=poses;return poses

    def geometry(self,path):
        path=Path(path);gid=slug(path.as_posix())
        if gid in self.base:return gid
        obj=read(self.install/path).find('object')
        if obj is None:return None
        groups=[];stem=path.stem;sex='female' if stem.startswith('female') else 'male'
        for sh in obj:
            if sh.get('lod',[0])[0]:continue
            sk=sh.find('skeleton');skeleton=[]
            if sk is not None:
                bones=sorted(sk,key=lambda b:int(b.get('ix')[0]));keys=[b.tag.split(':')[-1] for b in bones]
                kind='head' if 'head_root' in keys else 'body'
                rig=self.rig(sex,kind)
                for k,b in zip(keys,bones):
                    inv=np.vstack((b.get('tx').reshape(4,3).T,[0,0,0,1]));skeleton.append(rig[k]@inv if k in rig else np.eye(4))
            for mi,m in enumerate(sh.findall('mesh')):
                if m.get('tri') is None:continue
                v=m.get('p').reshape(-1,3).astype(float);n=m.get('n').reshape(-1,3).astype(float);uv=m.get('u0')
                if uv is None:continue
                tri=m.get('tri').reshape(-1,3);skin=m.find('skin');mat=None
                if skin is not None and skeleton:
                    w=skin.get('w').reshape(len(v),-1);ids=skin.get('ix').reshape(w.shape).clip(0,len(skeleton)-1)
                    mat=(np.asarray(skeleton)[ids]*w[:,:,None,None]).sum(1)
                if stem in ('male_body','female_body'):
                    # Clothing covers the torso. Keep exposed arms, hands, neck and feet in every costume.
                    keep=(np.abs(v[:,0])>24)|(v[:,1]>143)|(v[:,1]<10)
                    tri=tri[np.all(keep[tri],axis=1)]
                def deform(points,vectors=False):
                    if mat is None:return points
                    r=np.einsum('nij,nj->ni',mat[:,:3,:3],points)
                    return r if vectors else r+mat[:,:3,3]
                verts=deform(v);norms=deform(n,True);norms/=np.maximum(np.linalg.norm(norms,axis=1)[:,None],1e-7)
                gidp=gid+'-'+str(len(groups));geom=self.cache/(gidp+'.bin')
                with geom.open('wb') as f:
                    f.write(struct.pack('<II',len(v),tri.size))
                    for arr in [verts,norms,uv]:f.write(np.ascontiguousarray(arr,dtype='<f4').tobytes())
                    f.write(np.ascontiguousarray(tri,dtype='<u4').tobytes())
                if stem in ('male_head','female_head') and not groups:
                    morphs={}
                    for ps in (self.install/path.parent/'blendshapes').glob('*.mesh'):
                        if not re.search(r'(cheek_width_max|nose_forward_max|old_1)$',ps.stem):continue
                        sm=read(ps).find('object')[0].find('mesh');pv=sm.get('p').reshape(-1,3)
                        if pv.shape==v.shape:morphs[ps.stem.removeprefix(sex+'_')]=deform(pv-v,True).astype('f')
                    self.faces[sex]=morphs
                groups.append({'file':geom.name,'name':sh.tag,'index':mi})
        self.base[gid]=groups;return gid

    def texture(self,path,kind):
        if not path or not path.exists():return None
        key=slug(str(path)+kind)
        if key in self.tex:return key
        im=Image.open(path).convert('RGBA')
        if max(im.size)>512:
            if kind=='mask':im=Image.merge('RGBA',[c.resize((512,512)) for c in im.split()])
            else:im.thumbnail((512,512),Image.Resampling.LANCZOS)
        array=np.array(im)
        if kind=='eye':
            a=array[:,:,3:]/255
            array[:,:,:3]=np.uint8((np.array([220,208,199])+array[:,:,:3]*.06)*(1-a)+array[:,:,:3]*a)
        dest=self.cache/(key+'.rgba');dest.write_bytes(array.tobytes());self.tex[key]=list(im.size);return key

    @lru_cache(None)
    def model(self,entity):
        e=self.c['entities'].get(entity,{})
        for _ in range(8):
            if e.get('mesh') or not e.get('clone'):break
            e={**self.c['entities'].get(e['clone'],{}),**{k:v for k,v in e.items() if v}}
        m=self.c['meshes'].get(e.get('mesh') or entity)
        if not m:return None
        path=Path(m['file']);absolute=self.install/path
        if not absolute.is_file():return None
        gid=self.geometry(path)
        if not gid or not self.base[gid]:return None
        materials=[];stem=path.stem
        for g in self.base[gid]:
            spec=next((s for s in m['materials'] if s.get('name','').lower()==g['name'].lower() and str(g['index'])==s.get('index','0')),next(iter(m['materials']),{}))
            reference=spec.get('texture_diffuse','')
            candidates=[absolute.parent/reference,self.game/reference,self.diffuse_by_name.get(Path(reference).name.lower()),absolute.with_name(stem+'_diffuse.dds'),*sorted(absolute.parent.glob('*diffuse.dds'))]
            diffuse=next((p for p in candidates if p and p.is_file()),None)
            kind='hair' if re.search(r'_(?:hair|beard|mustache)',stem) else 'eye' if stem.endswith('_eyes') else 'skin' if stem in ('male_head','male_body','female_head','female_body') else 'cloth'
            palette=self.c['palettes'].get(e.get('variation'))
            mask=self.game/e['mask'] if e.get('mask') else None
            colors=[]
            if palette and (self.game/palette).is_file():
                pal=np.array(Image.open(self.game/palette).convert('RGB'));colors=pal[0,np.linspace(0,pal.shape[1]-1,4).round().astype(int)].tolist()
            mat={'map':self.texture(diffuse,kind),'kind':kind,'mask':self.texture(mask,'mask') if colors else None,'colors':colors}
            materials.append(mat)
        self.materials[entity]={'geometry':gid,'material':materials}
        return entity

def main():
    cli=argparse.ArgumentParser();cli.add_argument('installation',type=Path);args=cli.parse_args()
    lib=json.loads((LIBRARY/'character-catalog.json').read_text(encoding='utf8'))
    bake=Baker(args.installation.resolve(),lib)
    out=ROOT/'public/commander-parts';out.mkdir(parents=True,exist_ok=True)
    options={};assembly={};shapes={};published={}
    def publish(data,extension):
        digest=hashlib.sha256(data).hexdigest()[:16];name=digest+extension
        if name not in published:(out/name).write_bytes(data);published[name]=True
        return name
    def texarray(key):
        w,h=bake.tex[key];return np.frombuffer((CACHE/(key+'.rgba')).read_bytes(),np.uint8).reshape(h,w,4)
    @lru_cache(None)
    def export_model(entity):
        import io
        if not bake.model(entity):return None
        model=bake.materials[entity];result=[]
        for g,m in zip(bake.base[model['geometry']],model['material']):
            if not m['map']:return None
            arr=texarray(m['map']).copy()
            if m['mask'] and m['colors']:
                mask=texarray(m['mask']);size=(arr.shape[1],arr.shape[0])
                weights=np.stack([np.array(Image.fromarray(mask[:,:,k]).resize(size)) for k in range(4)],axis=-1)/255
                cols=weights@np.array(m['colors'])/255+np.maximum(0,1-weights.sum(2))[:,:,None]
                arr[:,:,:3]=(arr[:,:,:3]*cols.clip(.04,1)).clip(0,255)
            if entity in ('male_head_mesh','female_head_mesh'):
                brows=bake.por/'decals/male_eyebrows/decal_male_eyebrows_avg_spacing_avg_thickness_diffuse.dds'
                brow=np.array(Image.open(brows).convert('RGBA').resize((arr.shape[1],arr.shape[0])))/255
                arr[:,:,:3]=(arr[:,:,:3]*(1-.68*brow[:,:,3:]*(1-brow[:,:,:3]*.66))).clip(0,255)
            im=Image.fromarray(arr) if m['kind']=='hair' else Image.fromarray(arr[:,:,:3])
            buffer=io.BytesIO();im.save(buffer,format='WEBP',quality=90,method=3)
            result.append({'geometry':publish((CACHE/g['file']).read_bytes(),'.bin'),'image':publish(buffer.getvalue(),'.webp'),'kind':m['kind']})
        assembly[entity]=result;return entity
    tags={}
    for p in (bake.game/'gfx/portraits/accessories').glob('*.txt'):
        for key,fields in blocks(definitions(p)):tags[key]=val(fields,'set_tags','')
    styles={
      'hair':r'hair_(?:(?:european|asian|chinese|japanese|arabic|african|indian|korean)_\d+|european_short_haircut_01)',
      'beard':r'beard_(?:european|asian|african|indian)_\d+',
      'mustache':r'mustache_(?:european|asian|indian)_\d+',
      'hat':r'headgear_(?:european_(?:military|common|royal)|chinese_(?:court|common|imperial)|japanese_common|american_(?:military|common)|indian_common|arabic_common|african_common)_\d+|headgear_european_military_cap_01',
      'uniform':r'coat_(?:(?:british|french|american|european)_\d+|gb_admiral|russian_military_01|european_military_01|european_greatcoat_01)|outfit_(?:chinese_(?:court|common|01_mid|01_high)|japanese_(?:common|01_mid)|european_(?:royal|common)|arabic_common|african_common|indian_common)(?:_\d+)?',
      'trousers':r'legwear_(?:european_military(?:_white|_red|_blue)?|russian_military)_\d+',
      'shoulders':r'epaulettes_\d+',
    }
    for sex in ('male','female'):
        options[sex]={}
        for name in ('body','head','eyes','teeth'):
            assert export_model(sex+'_'+name+'_mesh')
        for slot,pat in styles.items():
            entries={}
            for ident,acc in sorted(lib['accessories'].items()):
                if not re.fullmatch(sex+'_(?:'+pat+')',ident):continue
                entities=acc['entities']
                default=next((e.get('entity') for e in entities if not e.get('required_tags') and e.get('entity')),None)
                if not default or not export_model(default):continue
                entry={'entity':default}
                if slot=='hat':entry['tags']=[s.strip() for s in tags.get(ident,'').split(',') if s.strip()]
                if slot=='hair':
                    variants={}
                    for e in entities:
                        tag=e.get('required_tags','').strip();ent=e.get('entity')
                        if tag and ('cap' in tag or tag=='no_hair'):
                            if not ent:variants[tag]=None
                            elif export_model(ent):variants[tag]=ent
                    if variants:entry['variants']=variants
                entries[ident]=entry
            options[sex][slot]=entries
        shapes[sex]={k:publish(v.astype('<f4').tobytes(),'.bin') for k,v in bake.faces[sex].items()}
    # The simulation and server only need the small allowlist. Render data loads when a custom appearance is used.
    keys={s:{k:list(v) for k,v in slots.items()} for s,slots in options.items()}
    write_json(ROOT/'src/game/commanderPartIds.json',keys)
    write_json(out/'parts.json',{'options':options,'models':assembly,'shapes':shapes})
    from idle import export
    export(args.installation.resolve(),out)
    print({s:{k:len(v) for k,v in slots.items()} for s,slots in options.items()},flush=True)
    print(len(published),'unique files;',round(sum((out/k).stat().st_size for k in published)/2**20,1),'MiB')

if __name__=='__main__':main()

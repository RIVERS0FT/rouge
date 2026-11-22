"""Export the portrait idle clips and original garment skinning for the lobby."""
import argparse
import json
import struct
from pathlib import Path

from prepare import LIBRARY, PDX, ROOT, np, read, write_json
from scipy.spatial.transform import Rotation

CLIPS = {name: 'emotions_idle'+name.capitalize() for name in ('happy','proud','scheming','boastful')}
# Right has paired body and facial clips for all four gestures.
GESTURES = {name:'General_VS_Right_'+suffix for name,suffix in
            [('point','Point'),('fist','Fist'),('cross','Cross'),('handsHips','HandsHips')]}

def bone_name(tag):
    return tag.split(':')[-1].removeprefix('male_head_rig_01_').removeprefix('female_head_rig_01_')

def inverse_bind(bone):
    return np.vstack((bone.get('tx').reshape(4,3).T,[0,0,0,1]))

def skeleton(shape):
    return sorted(shape.find('skeleton'),key=lambda b:int(b.get('ix')[0]))

class Rig:
    def __init__(self,portraits,sex):
        self.names=[];self.parents=[];self.rest=[];self.paths={}
        for kind in ('body','head'):
            stem=sex+'_'+kind
            self.paths[kind]=portraits/stem/stem
            bones=skeleton(read(self.paths[kind].with_suffix('.mesh')).find('object')[0])
            bind=np.linalg.inv(np.array([inverse_bind(b) for b in bones]))
            offset=len(self.names)
            for i,b in enumerate(bones):
                parent=int(b.get('pa',[-1])[0])
                self.names.append(bone_name(b.tag))
                # A relative head root mounts on the chest. Its mesh bind is in head space.
                self.parents.append(offset+parent if parent>=0 else self.names.index('bn_sp_thoracic') if kind=='head' else -1)
                self.rest.append(np.linalg.inv(bind[parent])@bind[i] if parent>=0 else bind[i])
        self.rest=np.array(self.rest)

    def clip(self,suffix):
        tracks={}
        for kind,path in self.paths.items():
            info,count,channels=PDX['decode_clip'](path.with_name(path.name+'_'+suffix+'.anim'))
            duration=(count-1)/float(info.get('fps')[0])
            if kind=='body':
                length=duration
                samples=max(2,round(length*20)+1)
            # Head and torso can be authored at different frame rates.
            frame=np.linspace(0,count-1,samples)
            lo=frame.astype(int);hi=np.minimum(lo+1,count-1);frac=(frame-lo)[:,None]
            for bone in info:
                values={}
                for channel in 'tqs':
                    data=channels.get((bone.tag,channel))
                    if data is None:
                        values[channel]=np.broadcast_to(bone.get(channel),(samples,len(bone.get(channel))))
                    else:
                        a,b=data[lo],data[hi]
                        if channel=='q':b=np.where((a*b).sum(1,keepdims=True)<0,-b,b)
                        values[channel]=a+(b-a)*frac
                matrix=np.tile(np.eye(4),(samples,1,1))
                matrix[:,:3,:3]=Rotation.from_quat(values['q']).as_matrix()*values['s'][:,None,:]
                matrix[:,:3,3]=values['t']
                tracks[bone_name(bone.tag)]=matrix
        locals=np.stack([tracks[name] for name in self.names],axis=1)
        head=self.names.index('head_root')
        if locals[0,head,1,3]>60:
            # Express absolute head clips in the same chest-relative hierarchy.
            chest=self.parents[head];mount=locals[:,chest]
            while self.parents[chest]>=0:
                chest=self.parents[chest];mount=locals[:,chest]@mount
            if np.allclose(locals[:,head],locals[0,head]):
                # The emotion clips supply a single model-space placement for the head rig.
                # Register it at the first pose so subsequent chest motion is inherited.
                attachment=np.linalg.solve(mount[0],locals[0,head])
                neck=self.names.index('bn_h_neck_1')
                collar=self.names.index('bn_sp_cervical')
                # These pivots meet at the base of the neck, including on clips whose
                # authored head and body have slightly different starting translations.
                attachment[:3,3]=locals[0,collar,:3,3]-attachment[:3,:3]@locals[0,neck,:3,3]
                locals[:,head]=attachment
            else:
                locals[:,head]=np.linalg.inv(mount)@locals[:,head]
        return length,locals

def export(installation,out):
    import hashlib
    from functools import lru_cache
    def publish(data,ext):
        name=hashlib.sha256(data).hexdigest()[:16]+ext
        if not (out/name).exists():(out/name).write_bytes(data)
        return name
    portraits=installation/'game/gfx/models/portraits'
    rigs={sex:Rig(portraits,sex) for sex in ('male','female')}
    catalog=json.loads((LIBRARY/'character-catalog.json').read_text(encoding='utf8'))
    parts=json.loads((out/'parts.json').read_text(encoding='utf8'))
    skins={};result={}
    @lru_cache(None)
    def geometry(path):
        sex='female' if path.stem.startswith('female') else 'male'
        rig=rigs[sex];files=[]
        for shape in read(path).find('object'):
            if shape.get('lod',[0])[0]:continue
            bones=skeleton(shape)
            for mesh in shape.findall('mesh'):
                if mesh.get('tri') is None or mesh.get('u0') is None:continue
                points=mesh.get('p').reshape(-1,3);skin=mesh.find('skin')
                weights=skin.get('w').reshape(len(points),4)
                indices=skin.get('ix').reshape(weights.shape)
                unbound=weights.sum(1)==0
                if np.any(unbound):
                    # One imperial hat has an unweighted seam vertex. Follow the adjacent fabric.
                    valid=np.flatnonzero(~unbound);weights=weights.copy();indices=indices.copy()
                    for vertex in np.flatnonzero(unbound):
                        nearest=valid[np.argmin(((points[valid]-points[vertex])**2).sum(1))]
                        weights[vertex]=weights[nearest];indices[vertex]=indices[nearest]
                used=np.unique(indices[weights>0]);remap={ix:i for i,ix in enumerate(used)}
                ix=np.zeros(weights.shape,dtype='u1')
                for old,new in remap.items():ix[(indices==old)&(weights>0)]=new
                packed=np.rint(weights*255/weights.sum(1,keepdims=True)).astype('i2')
                packed[np.arange(len(points)),np.argmax(weights,axis=1)]+=255-packed.sum(1)
                palette=[bones[i] for i in used]
                data=b''.join([struct.pack('<II',len(points),len(palette)),points.astype('<f4').tobytes(),
                    mesh.get('n').astype('<f4').tobytes(),ix.tobytes(),packed.astype('u1').tobytes(),
                    np.array([inverse_bind(b).T for b in palette],dtype='<f4').tobytes(),
                    bytes(rig.names.index(bone_name(b.tag)) for b in palette)])
                files.append(publish(data,'.skin'))
        return files
    for entity,pieces in parts['models'].items():
        e=catalog['entities'].get(entity,{})
        while not e.get('mesh') and e.get('clone'):e=catalog['entities'][e['clone']]
        path=installation/catalog['meshes'][e.get('mesh') or entity]['file']
        for piece,skin in zip(pieces,geometry(path),strict=True):skins[piece['geometry']]=skin
    for sex,rig in rigs.items():
        clips=[];payload=bytearray();shapes={}
        head=rig.paths['head']
        neutral=read(head.with_suffix('.mesh')).find('object')[0].find('mesh').get('p')
        for name in parts['shapes'][sex]:
            shape=read(head.parent/'blendshapes'/(sex+'_'+name+'.mesh')).find('object')[0].find('mesh')
            shapes[name]=publish((shape.get('p')-neutral).astype('<f4').tobytes(),'.bin')
        for name,suffix in (CLIPS|GESTURES).items():
            source=rigs['female'] if name in GESTURES else rig
            duration,local=source.clip(suffix)
            if source is not rig:
                order=[source.names.index(b) for b in rig.names]
                local=(rig.rest@np.linalg.inv(source.rest[order]))@local[:,order]
            tracks=[];count=len(local)
            for i in range(len(rig.names)):
                m=local[:,i]
                q=Rotation.from_matrix(m[:,:3,:3]).as_quat()
                # Keep consecutive keys in the same quaternion hemisphere.
                signs=np.where((q[1:]*q[:-1]).sum(1)<0,-1,1).cumprod()
                q[1:]*=signs[:,None]
                for prop,keys in [('position',m[:,:3,3]),('quaternion',q)]:
                    if np.max(abs(keys-keys[0]))<1e-5:keys=keys[:1]
                    tracks.append([i,prop,len(payload)//4,len(keys)])
                    payload.extend(keys.astype('<f4').tobytes())
            clips.append(dict(name=name,duration=duration,count=count,tracks=tracks))
        result[sex]=dict(bones=rig.names,parents=rig.parents,clips=clips,data=publish(payload,'.poses'),shapes=shapes)
    write_json(out/'idle.json',dict(rigs=result,skins=skins))
    print('Exported eight idle clips per body and',len(skins),'skinned parts.',flush=True)

if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('installation',type=Path)
    export(cli.parse_args().installation,ROOT/'public/commander-parts')

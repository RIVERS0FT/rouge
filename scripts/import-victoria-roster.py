"""Build the optional local 3D roster from an installed Victoria 3 game.

python scripts/import-victoria-roster.py "E:/steam/steamapps/common/Victoria 3"
Requires Python 3, numpy and Pillow with DDS support.
"""
import argparse
import io
import re
import struct
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'src/render/assets/local-roster'
WALK, ATTACK, FPS = 25, 15, 24
POSES = WALK + ATTACK + 1
TILE, BORDER = 512, 8


@lru_cache(maxsize=48)
def read_pdx(path):
    """Read the tagged numeric arrays used by binary Clausewitz mesh and animation files."""
    data = path.read_bytes()
    if not data.startswith(b'@@b@'):
        raise ValueError(f'Expected a binary PDX asset: {path}')
    root = ET.Element('file')
    stack = [root]
    pos = 4
    while pos < len(data):
        if data[pos] == ord('['):
            start = pos
            while data[pos] == ord('['):
                pos += 1
            depth = pos - start
            end = data.index(0, pos)
            stack = stack[:depth]
            stack.append(ET.SubElement(stack[-1], data[pos:end].decode('latin1')))
            pos = end + 1
            continue
        if data[pos] != ord('!'):
            raise ValueError(f'Invalid PDX field in {path} at {pos}')
        n = data[pos + 1]
        key = data[pos + 2:pos + 2 + n].decode('latin1')
        pos += n + 2
        typ, count = struct.unpack_from('<cI', data, pos)
        pos += 5
        if typ == b's':
            size, = struct.unpack_from('<I', data, pos)
            pos += 4
            value = data[pos:pos + size].rstrip(b'\0').decode('latin1')
            pos += size
        else:
            value = np.frombuffer(data, {b'i':'<i4', b'f':'<f4'}[typ], count, pos)
            pos += count * 4
        stack[-1].attrib[key] = value
    return root


def affine(offset=(0,0,0), scale=1):
    m = np.diag([scale, scale, scale, 1.0])
    m[:3,3] = offset
    return m


def local_pose(t, q, scale):
    x, y, z, w = q / np.linalg.norm(q)
    m = np.eye(4)
    m[:3,:3] = np.array([
        [1-2*(y*y+z*z), 2*(x*y-w*z), 2*(x*z+w*y)],
        [2*(x*y+w*z), 1-2*(x*x+z*z), 2*(y*z-w*x)],
        [2*(x*z-w*y), 2*(y*z+w*x), 1-2*(x*x+y*y)],
    ]) * scale
    m[:3,3] = t
    return m


@lru_cache(maxsize=48)
def decode_clip(path):
    doc = read_pdx(path)
    info, samples = doc.find('info'), doc.find('samples')
    count = int(info.get('sa')[0])
    channels = {}
    for ch in 'tqs':
        cursor = 0
        keyed = [(b.tag,len(b.get(ch))) for b in info if ch in b.get('sa')]
        if not keyed:
            continue
        values = samples.get(ch).reshape(count, sum(n for _,n in keyed))
        for bone,n in keyed:
            channels[bone,ch] = values[:,cursor:cursor+n]
            cursor += n
    return info, count, channels


def world_poses(shape, files, idle, walk, attack, attack_time):
    skeleton = sorted(shape.find('skeleton'),key=lambda b:int(b.get('ix')[0]))
    names = [b.tag for b in skeleton]
    inverse_bind = np.array([np.vstack((b.get('tx').reshape(4,3).T,[0,0,0,1])) for b in skeleton])
    parents = [int(b.get('pa',[-1])[0]) for b in skeleton]
    assert all(p<i for i,p in enumerate(parents))
    bind = np.linalg.inv(inverse_bind)
    rest = [m if p<0 else inverse_bind[p]@m for m,p in zip(bind,parents)]
    result = np.empty((POSES,len(names),4,4))
    for clip,start,length in [(walk,0,WALK),(attack,WALK,ATTACK),(idle,WALK+ATTACK,1)]:
        info,count,channels = decode_clip(files[clip+'.anim'])
        bones = {b.tag:b for b in info}
        rate = info.get('fps')[0]
        if start==0:
            frames = np.rint(np.linspace(0,count-1,length)).astype(int)
        else:
            seconds = attack_time if start==WALK else 0
            frames = np.minimum(count-1,np.rint((seconds+np.arange(length)/FPS)*rate)).astype(int)
        for k,frame in enumerate(frames,start):
            for i,name in enumerate(names):
                transform = rest[i]
                if name in bones:
                    b = bones[name]
                    vals = [channels[name,ch][frame] if (name,ch) in channels else b.get(ch) for ch in 'tqs']
                    transform = local_pose(*vals)
                p = parents[i]
                result[k,i] = transform if p<0 else result[k,p]@transform
    return names, inverse_bind, result


class Model:
    def __init__(self, files):
        self.files = files
        self.parts = []
        self.matrices = []
        self.textures = []

    def add(self, name, clips=None, parent=None, mount=None, texture=None, vertex_scale=1):
        path = self.files[name+'.mesh']
        shape, = [s for s in read_pdx(path).find('object') if s.get('lod',[0])[0]==0]
        mesh, = shape.findall('mesh')
        world = np.repeat(np.eye(4)[None],POSES,axis=0) if parent is None else parent
        if mount is not None:
            world = world @ mount
        offset = sum(m.shape[1] for m in self.matrices)
        if clips:
            names, inv, poses = world_poses(shape,self.files,*clips)
            bones = world[:,None] @ poses
            matrices = bones @ inv
            mounts = {name:bones[:,i] for i,name in enumerate(names)}
        else:
            matrices = world[:,None]
            mounts = {}
        self.matrices.append(matrices)
        pos = mesh.get('p').reshape(-1,3)*vertex_scale
        skin = mesh.find('skin')
        pairs = np.zeros((len(pos),2),dtype=int)
        weights = np.full(len(pos),255,dtype=int)
        if clips and skin is not None:
            ws = skin.get('w').reshape(len(pos),-1)
            js = skin.get('ix').reshape(ws.shape)
            top = np.argsort(-ws,axis=1,kind='stable')[:,:2]
            selected = np.take_along_axis(ws,top,axis=1)
            pairs = np.maximum(0,np.take_along_axis(js,top,axis=1))
            weights = np.rint(255*selected[:,0]/np.maximum(selected.sum(axis=1),1e-9)).astype(int)
        asset = path.with_suffix('.asset').read_text(encoding='utf-8-sig')
        diffuse = re.search(r'texture_diffuse\s*=\s*"([^"]+)"',asset)
        tex = texture or (diffuse[1] if diffuse else name+'_diffuse.dds')
        mask = path.with_name(name+'_masks.dds')
        key = (path.with_name(tex),mask if mask.exists() else None)
        if key not in self.textures:
            self.textures.append(key)
        indices = mesh.get('tri').reshape(-1,3)
        self.parts.append((pos,mesh.get('n').reshape(-1,3),mesh.get('u0').reshape(-1,2),
                           pairs+offset,weights,indices,self.textures.index(key)))
        return mounts

    def write(self, path, size):
        # The single draw call for a unit covers its body, mount and equipment.
        tile = TILE+2*BORDER
        atlas = Image.new('RGBA',(len(self.textures)*tile,tile))
        for i,(tex,mask) in enumerate(self.textures):
            img = Image.open(tex).convert('RGB').resize((TILE,TILE),Image.Resampling.LANCZOS)
            alpha = Image.new('L',img.size,0)
            if mask:
                channels = np.asarray(Image.open(mask).convert('RGB').resize(img.size))
                alpha = Image.fromarray(channels.max(axis=2))
            img.putalpha(alpha)
            extended = np.pad(np.array(img),((BORDER,BORDER),(BORDER,BORDER),(0,0)),mode='wrap')
            atlas.paste(Image.fromarray(extended),(i*tile,0))
        vertices,indices,lookup = [],[],{}
        # PDX faces -Z. Mirror Z for Rouge's +Z forward convention and reverse winding.
        axes = np.array([1,1,-1])
        for pos,normal,uv,pairs,w,triangles,tex in self.parts:
            for tri in triangles[:,::-1]:
                base = np.floor(uv[tri].mean(axis=0))
                for j in tri:
                    coord = np.clip(uv[j]-base,-BORDER/TILE,(TILE+BORDER)/TILE)
                    u,v = ((tex*tile+BORDER+coord[0]*TILE)/atlas.width,(BORDER+coord[1]*TILE)/atlas.height)
                    point = np.rint(pos[j]*axes*4096)
                    if np.abs(point).max()>32767:
                        raise ValueError(f'Position exceeds packed range in {path.name}')
                    vertex = struct.pack('<3h3bB8B2H',*point.astype(int),
                        *np.rint(np.clip(normal[j]*axes,-1,1)*127).astype(int),0,
                        255,255,255,0,*pairs[j],w[j],0,*np.rint(np.clip([u,v],0,1)*65535).astype(int))
                    if vertex not in lookup:
                        lookup[vertex] = len(vertices)
                        vertices.append(vertex)
                    indices.append(lookup[vertex])
        palette = np.concatenate(self.matrices,axis=1)
        assert len(vertices)<65536 and palette.shape[1]<256 and np.isfinite(palette).all()
        mirror = np.diag([1,1,-1,1])
        palette = affine(scale=size) @ mirror @ palette @ mirror
        header = struct.pack('<4s7I',b'RINF',4,len(vertices),len(indices),palette.shape[1],WALK,ATTACK,FPS)
        packed = header+b''.join(vertices)+np.asarray(indices,dtype='<u2').tobytes()
        image=io.BytesIO()
        atlas.save(image,format='PNG')
        path.write_bytes(packed+bytes(-len(packed)%4)+palette[:,:,:3].astype('<f4').tobytes()+image.getvalue())
        print(f'{path.stem:14} {len(indices)//3:5} triangles, {palette.shape[1]:2} joints')


EUROPEAN_T3 = 'military_infantry_european_t3'


def foot(model,weapon,action,idle='blunderbuss_idle_01'):
    base = 'military_infantry_'
    poses = model.add(EUROPEAN_T3,(
        base+idle,base+'blunderbuss_walk_01',base+action,.8))
    hand = poses['r_hand_attach'].copy()
    if weapon!='chauchat':
        hand[WALK:WALK+ATTACK] = poses['l_hand_attach'][WALK:WALK+ATTACK]
    model.add('military_arms_'+weapon,parent=hand)
    return poses


def mount_horse(model,heavy=False):
    horse = 'military_cavalry_horse_'
    kind = 'cuirassier' if heavy else 'hussar'
    return model.add(horse+'01',(horse+kind+'_idle',horse+'01_walk',horse+kind+'_charge',.5),
        texture=horse+('black' if heavy else 'beige')+'_01_diffuse.dds')


def build(files,out):
    for kind in ['infantry','skirmisher','engineer','grenadier','cavalry','heavyCavalry','artillery','horseArtillery','transport']:
        model = Model(files)
        size=1.95
        if kind in ('infantry','engineer'):
            poses=foot(model,'mauser98_bayonet','mauser98_fire_aggressive')
            if kind=='engineer':
                # The portrait prop uses centimetres. Stow the shovel along the military backpack.
                bind=poses['chest']
                rest=read_pdx(files[EUROPEAN_T3+'.mesh']).find('object')[0].find('skeleton')
                chest=next(b for b in rest if b.tag=='chest')
                inverse=np.vstack((chest.get('tx').reshape(4,3).T,[0,0,0,1]))
                tool=affine((.115,.68,.145))
                tool[:3,:3]=np.array([[1,0,0],[0,0,-1],[0,1,0]])@tool[:3,:3]
                model.add('prop_shovel',parent=bind,mount=inverse@tool,vertex_scale=.005)
        elif kind=='skirmisher':
            foot(model,'dreyseneedle','dreyseneedlegun_fire_aggressive','blunderbuss_scout_01')
        elif kind=='grenadier':
            foot(model,'chauchat','chauchat_aggressive')
        elif kind in ('cavalry','heavyCavalry'):
            heavy=kind=='heavyCavalry'
            saddle=mount_horse(model,heavy)['Saddle_Node']
            arm='sword' if heavy else 'saber'
            rider='military_cavalry_'+arm+'_rider_'
            poses=model.add(EUROPEAN_T3,(rider+'idle','military_cavalry_saber_walk_01',rider+'charge',.5),parent=saddle)
            model.add('military_arms_'+arm,parent=poses['r_hand_attach'])
            size=1.67
        elif kind in ('artillery','horseArtillery'):
            mobile=kind=='horseArtillery'
            gun='military_artillery_'+('mobile' if mobile else 'cannon')+'_generic'
            origin=None
            if mobile:
                mount_horse(model)
                origin=affine((0,0,1.72))
                origin[:3,:3]=np.diag([-1,1,-1])
            model.add(gun,(gun+'_idle',gun+'_idle',gun+'_fire_aggressive',.7),mount=origin)
            size=1.48 if mobile else 1.8
        else:
            boat='military_transport_naval_rowboat_generic'
            model.add(boat,(boat+'_idle',boat+'_moving',boat+'_idle',0))
            size=2.28
        model.write(out/(kind+'.bin'),size)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('installation',type=Path)
    args=parser.parse_args()
    models=args.installation/'game/gfx/models'
    if not models.is_dir():
        parser.error(f'Missing {models}')
    files={f.name:f for f in (models/'military').rglob('*') if f.suffix in {'.mesh','.anim'}}
    shovel=models/'portraits/attachments/props/shovel/prop_shovel.mesh'
    files[shovel.name]=shovel
    OUT.mkdir(parents=True,exist_ok=True)
    # Renamed files keep their Windows ACL. Stage with the output directory's
    # inherited permissions so the dev server can read the published models.
    staging=OUT/('.import-'+uuid4().hex)
    staging.mkdir()
    try:
        build(files,staging)
        for asset in staging.iterdir():
            asset.replace(OUT/asset.name)
    finally:
        for asset in staging.iterdir():
            asset.unlink()
        staging.rmdir()


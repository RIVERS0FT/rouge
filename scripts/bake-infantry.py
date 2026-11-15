"""Bake an original Rouge GLB into one shared indexed mesh and a pose palette.

blender -b --factory-startup --python-exit-code 1 --python scripts/bake-infantry.py -- input.glb src/render/assets/infantry.bin
Only asset processing uses Blender; the web app loads the compact binary directly.
"""
import array
import json
import math
import re
from pathlib import Path
import struct
import sys
import bpy
from mathutils import Matrix

_, source, output = sys.argv[sys.argv.index('--'):]
# A linked Blender Principled Base Color retains Blender's default 0.8 even
# when the glTF material's (implicit) baseColorFactor is 1. Read the source
# factors so vertex colors are never darkened by that editor-only default.
source_bytes = Path(source).read_bytes()
chunk_size = struct.unpack_from('<I', source_bytes, 12)[0]
source_model = json.loads(source_bytes[20:20 + chunk_size])
material_factors = {
    m['name']: m.get('pbrMetallicRoughness', {}).get('baseColorFactor', (1, 1, 1, 1))
    for m in source_model['materials']
}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
scene = bpy.context.scene
root = bpy.data.objects['root']
nodes = sorted(root.children_recursive, key=lambda a: a.name)
rigid = {}
bones = {}
joint_specs = []

def register(table, key, spec):
    if key not in table:
        table[key] = len(joint_specs)
        joint_specs.append(spec)
    return table[key]

def quantize(value, maximum):
    return round(min(1, max(-1, value)) * maximum)

def color(material):
    if material is None:
        return (.5, .5, .5), 0, 0
    # The Blender importer may split a material into .001/etc. variants
    # when it is shared by primitives with and without vertex colors.
    name = material.name
    source_name = name if name in material_factors else re.sub(r'\.\d{3}$', '', name)
    rgb = material_factors[source_name][:3]
    name = source_name.removesuffix(' | painted')
    tint = {'Navy wool': 208, 'Navy facing': 176, 'Blue stripe': 222}.get(name, 0)
    return rgb, tint, 255 if name.startswith('Flash ') else 0

def paint_layer(mesh, material):
    # Blender links a Color Attribute node only for glTF primitives with
    # COLOR_0, including unrenamed parts that share a painted mesh.
    principled = material.node_tree.nodes.get('Principled BSDF')
    links = principled.inputs['Base Color'].links
    nodes = [n for l in links for n in (l.from_node, *[e.from_node for i in l.from_node.inputs for e in i.links])]
    attr = next((n.layer_name or 'Color' for n in nodes if n.type == 'VERTEX_COLOR'), None)
    if attr is None and ' | painted' not in material.name:
        return None
    layer = mesh.color_attributes.get(attr or 'Color')
    if layer is None or layer.domain not in {'CORNER', 'POINT'}:
        raise RuntimeError(f'Missing vertex colors on {mesh.name} ({material.name})')
    return layer

def to_engine(v):
    return (v.x, v.z, -v.y)

# Compact vertex layout: XYZ signed Q12, unit normal signed i8, RGB linear,
# selective faction mix, two joint indices, first joint's weight and emissive mask.
vertices = []
dedup = {}
indices = array.array('H')
for obj in nodes:
    if obj.type != 'MESH':
        continue
    mesh = obj.data
    mesh.calc_loop_triangles()
    arm = next((m.object for m in obj.modifiers if m.type == 'ARMATURE'), None)
    if arm:
        local = arm.matrix_world.inverted_safe() @ obj.matrix_world
    else:
        p = obj.parent
        local = p.matrix_world.inverted_safe() @ obj.matrix_world
        joint = register(rigid, p.name, ('rigid', p.name, None))
    normal_matrix = local.to_3x3().inverted_safe().transposed()
    materials = [(color(m), paint_layer(mesh, m)) for m in mesh.materials]
    for tri in mesh.loop_triangles:
        (base_rgb, tint, glow), layer = materials[tri.material_index]
        for idx in tri.loops:
            loop = mesh.loops[idx]
            vert = mesh.vertices[loop.vertex_index]
            a = b = 0
            weight = 255
            if arm:
                groups = [(g.weight, obj.vertex_groups[g.group].name) for g in vert.groups if g.weight > 0]
                groups.sort(reverse=True)
                assert 1 <= len(groups) <= 2, groups
                a = register(bones, (arm.name, groups[0][1]), ('bone', arm.name, groups[0][1]))
                b = register(bones, (arm.name, groups[-1][1]), ('bone', arm.name, groups[-1][1]))
                weight = round(255 * groups[0][0] / sum(x[0] for x in groups))
            else:
                a = b = joint
            rgb = base_rgb
            if layer is not None:
                # .color is linear; .color_srgb would incorrectly brighten the bake.
                painted = layer.data[idx if layer.domain == 'CORNER' else loop.vertex_index].color
                rgb = tuple(a*b for a, b in zip(base_rgb, painted))
            v = struct.pack('<3h3bB8B', *(round(x * 4096) for x in to_engine(local @ vert.co)),
                            *(quantize(x, 127) for x in to_engine((normal_matrix @ mesh.corner_normals[idx].vector).normalized())), 0,
                            *(round(255 * max(0, min(1, x))) for x in rgb), tint, a, b, weight, glow)
            idx = dedup.get(v)
            if idx is None:
                idx = len(vertices)
                vertices.append(v)
                dedup[v] = idx
            indices.append(idx)
assert len(joint_specs) < 256
animated = [a for a in nodes if a.animation_data and a.animation_data.nla_tracks]

def frames(clip, count):
    for o in animated:
        for track in o.animation_data.nla_tracks:
            track.mute = track.name != clip
    scene.frame_set(1)
    cv = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    inv = cv.inverted()
    frames = []
    for f in range(1, count + 1):
        scene.frame_set(f)
        bpy.context.view_layer.update()
        for kind, name, bone in joint_specs:
            o = bpy.data.objects[name]
            if kind == 'rigid':
                mat = o.matrix_world
            else:
                b = o.pose.bones[bone]
                mat = o.matrix_world @ b.matrix @ b.bone.matrix_local.inverted()
            mat = cv @ mat @ inv
            for row in mat[:3]:
                frames.extend(row)
    return frames

walk = 25
shoot = 15
palette = frames('Walk', walk) + frames('Shoot', shoot)
# Reject malformed or accidentally duplicated clip captures.
assert max(abs(palette[i] - palette[i + len(joint_specs) * 12]) for i in range(len(joint_specs)*12)) > .005
assert all(math.isfinite(x) for x in palette)
if sys.byteorder != 'little':
    indices.byteswap()
header = struct.pack('<4s7I', b'RINF', 1, len(vertices), len(indices), len(joint_specs), walk, shoot, 24)
blob = header + b''.join(vertices) + indices.tobytes()
blob += bytes((-len(blob)) % 4)
blob += struct.pack(f'<{len(palette)}f', *palette)
output = Path(output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes(blob)
print(f'{output}: {len(vertices)} vertices, {len(indices)//3} triangles, {len(joint_specs)} joints, {len(blob)} bytes')

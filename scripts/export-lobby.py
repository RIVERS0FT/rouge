"""blender -b data/art/rouge-war-room.blend --python-exit-code 1 --python scripts/export-lobby.py [-- out.glb]

Exports the war room for real-time rendering: war-room.glb (PBR materials, a second UV set for
lighting, the sun in the camera extras) and war-room-lightmap.webp beside it, holding everything
the Cycles lights, world and windows contribute except direct sunlight, which the game adds live."""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import math
import struct
import sys
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import numpy as np

scene = bpy.context.scene
cam = scene.camera
frame = cam.data.view_frame(scene=scene)
cam["frame"] = [min(v.x/-v.z for v in frame), max(v.x/-v.z for v in frame),
                min(v.y/-v.z for v in frame), max(v.y/-v.z for v in frame)]
output = Path(__file__).resolve().parents[1] / "src/assets/lobby/war-room.glb"
if "--" in sys.argv[:-1]:
    output = Path(sys.argv[sys.argv.index("--")+1]).resolve()
lightmap_output = output.with_name(output.stem+"-lightmap.webp")
# The officers' mark: where the middle seat stands, fixed in the room (Blender coordinates) so
# reframing the camera never moves anyone. src/render/lobbyScene.ts adds the side seats to it.
pivot = Vector((.3042,-2.0714,0))
cam["stand"] = [pivot.x,pivot.z,-pivot.y]
# The lobby watches from this fraction of the way along the line from the authored camera to
# the mark: the mark keeps its place on screen while the officers fill about two thirds of it.
cam["approach"] = .72

# Geometric detail the lobby can show. It turns this camera up to ±0.22 rad about the mark
# (src/render/lobbyScene.ts) and never draws the frame taller than 2160 device pixels, so a
# surface moved less than half such a pixel keeps its silhouette.
l,r,b,t = cam["frame"]
eye = pivot+(cam.matrix_world.translation-pivot)*cam["approach"]
looking = cam.matrix_world.to_3x3() @ Vector((0,0,-1))
views = [(pivot+Matrix.Rotation(yaw,3,"Z")@(eye-pivot),Matrix.Rotation(yaw,3,"Z")@looking) for yaw in np.linspace(-.22,.22,9)]
# The commander editor dollies in on a seat (seatOffset in lobbyScene.ts) with the same lens,
# looking along the hero direction: no nearer than 2.2 m, at full-length and bust heights.
for x,y in ((0,0),(-1.12,.54),(1.12,.54)):
    for height in (.9,1.45):
        views.append((pivot+Vector((x,y,height))-looking*2.2,looking))
def tolerance(obj):
    """Half a device pixel, in metres, at the nearest corner of obj's bounds from any view."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return .5*(t-b)/2160*min(max((c-p).dot(d),.25) for p,d in views for c in corners)

# Every bevel is a 3-segment round. Dropping it moves the surface at most .414 of its
# width (sharp corner); one chamfer .293; two segments .076.
for obj in scene.objects:
    bevel = next((m for m in obj.modifiers if m.type=="BEVEL" and m.show_viewport),None)
    if obj.type!="MESH" or bevel is None or bevel.offset_type!="OFFSET" or bevel.segments!=3: continue
    limit = tolerance(obj)
    if .414*bevel.width<=limit: bevel.show_viewport = bevel.show_render = False
    elif .293*bevel.width<=limit: bevel.segments = 1
    elif .076*bevel.width<=limit: bevel.segments = 2

# Dense single-material meshes collapse as far as the surface stays within tolerance of
# the original both ways (sampled at vertices, edge midpoints and face centres).
def world_mesh(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(dg),depsgraph=dg)
    data.transform(obj.matrix_world)
    return data
def deviation(a,b):
    worst = 0
    for source,target in ((a,b),(b,a)):
        tree = BVHTree.FromPolygons([v.co for v in target.vertices],[p.vertices[:] for p in target.polygons])
        co = [v.co for v in source.vertices]
        for point in co+[(co[i]+co[j])/2 for i,j in (e.vertices for e in source.edges)]+[p.center for p in source.polygons]:
            worst = max(worst,tree.find_nearest(point)[3])
    return worst
for obj in list(scene.objects):
    if obj.type!="MESH" or obj.hide_render or obj.name=="Thin interior atmosphere" or any(m.type=="BEVEL" for m in obj.modifiers): continue
    original = world_mesh(obj)
    if sum(len(p.vertices)-2 for p in original.polygons)<48 or len({p.material_index for p in original.polygons})>1:
        bpy.data.meshes.remove(original)
        continue
    limit = tolerance(obj)
    collapse = obj.modifiers.new("Lobby detail","DECIMATE")
    collapse.use_collapse_triangulate = True
    low,high = 0.,1.
    for _ in range(7):
        collapse.ratio = (low+high)/2
        reduced = world_mesh(obj)
        if deviation(original,reduced)<=limit: high = collapse.ratio
        else: low = collapse.ratio
        bpy.data.meshes.remove(reduced)
    if high>.9: obj.modifiers.remove(collapse)
    else: collapse.ratio = high
    bpy.data.meshes.remove(original)

# The glTF renderer can sample the original packed silk, map and wood textures.
# Supply a tile for Blender's procedural patina and box-map the joinery before batching.
rng = np.random.default_rng(17)
field = np.zeros((256, 256))
for cells, amplitude in [(4,.24),(8,.19),(16,.10),(32,.08),(64,.05),(128,.03)]:
    knots = rng.uniform(-1,1,(cells,cells))
    grid = np.arange(256)*cells/256
    ix = grid.astype(int)
    w = grid-ix
    w = w*w*(3-2*w)
    across = knots[:,ix]*(1-w)+knots[:,(ix+1)%cells]*w
    field += amplitude*(across[ix,:]*(1-w[:,None])+across[(ix+1)%cells,:]*w[:,None])
patina = bpy.data.images.new("Worn finish",256,256)
rgba = np.ones((256,256,4),dtype=np.float32)
# A gentle tile: the tint carries each material's mean tone and the lightmap its grime and corners.
rgba[:,:,:3] = np.clip(.92+.3*field[:,:,None],.6,1)
patina.pixels.foreach_set(rgba.ravel())
patina.pack()

grained = set()
parquet = set()
wood_source = bpy.data.images["weathered-oak.jpg"]
width,height = wood_source.size
pixels = np.empty(width*height*4,dtype=np.float32)
wood_source.pixels.foreach_get(pixels)
pixels = pixels.reshape(height,width,4)
rgb = pixels[:,:,:3]
luma = rgb @ np.array([.2126,.7152,.0722],dtype=np.float32)

# Convert the authored height derivative to a tangent-space normal in metres.
# A parquet strip spans different distances along U and V after texture mapping.
floor = next(o for o in scene.objects if o.name.startswith("Individually laid oak strips"))
floor_shader = floor.data.materials[0].node_tree.nodes.get("Principled BSDF")
bump = floor_shader.inputs["Normal"].links[0].from_node
height_tex = bump.inputs["Height"].links[0].from_node
tile_scale = height_tex.inputs["Vector"].links[0].from_node.inputs[1].default_value[:2]
face = floor.data.polygons[0]
corners = [face.loop_indices[i] for i in (0,1,-1)]
texcoords = np.array([floor.data.uv_layers.active.data[i].uv[:] for i in corners])*tile_scale
positions = np.array([(floor.matrix_world @ floor.data.vertices[floor.data.loops[i].vertex_index].co)[:] for i in corners])
metres_per_uv = np.linalg.norm(np.linalg.solve(texcoords[1:]-texcoords[0],positions[1:]-positions[0]),axis=1)
relief = bump.inputs["Distance"].default_value*bump.inputs["Strength"].default_value
if bump.invert: relief = -relief
normal_pixels = np.ones_like(pixels)
for channel,(axis,size) in enumerate(((1,width),(0,height))):
    derivative = (np.roll(luma,-1,axis)-np.roll(luma,1,axis))*size*.5
    normal_pixels[:,:,channel] = -relief*derivative/metres_per_uv[channel]
xyz = normal_pixels[:,:,:3]
xyz /= np.linalg.norm(xyz,axis=2,keepdims=True)
xyz[:] = xyz*.5+.5
wood_normal = bpy.data.images.new("Waxed oak grain normal",width,height,alpha=False)
wood_normal.colorspace_settings.name = "Non-Color"
wood_normal.pixels.foreach_set(normal_pixels.ravel())
wood_normal.pack()

rgb[:] = rgb*.52+luma[:,:,None]*.48
wood = bpy.data.images.new("Waxed walnut",width,height)
wood.pixels.foreach_set(pixels.ravel())
white = bpy.data.images.new("White",1,1)
white.pixels.foreach_set([1.,1.,1.,1.])
# What each Cycles material becomes in glTF. The node trees stay intact until the lighting
# bake below has used them for bounce colour.
grained,parquet,plan = set(),set(),{}
for m in bpy.data.materials:
    if not m.use_nodes: continue
    tree = m.node_tree
    bs = next((n for n in tree.nodes if n.type=="BSDF_PRINCIPLED"),None)
    if not bs: continue
    image = next((n.image for n in tree.nodes if n.type=="TEX_IMAGE" and n.image),None)
    ramps = [n for n in tree.nodes if n.type=="VALTORGB"]
    color = list(bs.inputs["Base Color"].default_value[:3])
    rough = bs.inputs["Roughness"].default_value
    metal = bs.inputs["Metallic"].default_value
    if image and image.name.startswith("weathered-oak"):
        image = wood
        tone = next(n for n in tree.nodes if n.type=="HUE_SAT")
        gain = tone.inputs["Value"].default_value
        color = [gain*.87,gain*.74,gain*.64]
        if m.name.startswith("Waxed oak"):
            parquet.add(m.name)
            rough = .59
        else:
            grained.add(m.name)
            rough = max(rough,.52)
    elif image:
        color = [1,1,1]
    elif ramps:
        source = bs.inputs["Base Color"].links
        if source and source[0].from_node.type=="VALTORGB":
            color = list(source[0].from_node.color_ramp.evaluate(.50)[:3])
        grained.add(m.name)
        image = patina
    glow = next((n.inputs["Strength"].default_value for n in tree.nodes if n.type=="EMISSION"),0.)
    # Untextured surfaces read a white texel so they share the textured shader program.
    plan[m.name] = (image or white,color,rough,metal,glow)

# Materials that differ only in tint become one; the tint moves into the vertex colours.
looks = {name:(image.name,round(rough,4),round(metal,4),name in parquet,glow) for name,(image,_,rough,metal,glow) in plan.items()}
merged = {}
for look in set(looks.values()):
    names = sorted(n for n,v in looks.items() if v==look)
    if len(names)>1:
        for name in names: merged[name] = (bpy.data.materials[names[0]],plan[name][1])

dg = bpy.context.evaluated_depsgraph_get()
objects = []
for original in list(scene.objects):
    if original.type not in {"MESH","CURVE","FONT","SURFACE"} or original.hide_render or original.name=="Thin interior atmosphere": continue
    evaluated = original.evaluated_get(dg)
    data = bpy.data.meshes.new_from_object(evaluated,depsgraph=dg)
    if not data.polygons: continue
    data.transform(original.matrix_world)
    uv = data.uv_layers.active or data.uv_layers.new(name="UVMap")
    uv.name = "UVMap"
    for face in data.polygons:
        material = data.materials[face.material_index].name
        if material in parquet:
            for li in face.loop_indices:
                point = uv.data[li].uv
                point.x *= tile_scale[0]
                point.y *= tile_scale[1]
        elif material in grained:
            normal = face.normal
            axis = max(range(3), key=lambda j: abs(normal[j]))
            a,b = [(1,2),(0,2),(0,1)][axis]
            for li in face.loop_indices:
                point = data.vertices[data.loops[li].vertex_index].co
                uv.data[li].uv = (point[a]*.74,point[b]*.74)
    # Per corner: the face's merged-away tint (white elsewhere).
    sides = np.empty(len(data.polygons),dtype=np.int64)
    data.polygons.foreach_get("loop_total",sides)
    tints = np.array([[*merged.get(data.materials[p.material_index].name,(None,(1,1,1)))[1],1] for p in data.polygons],dtype=np.float32)
    tint = data.color_attributes.new(name="Tint",type="FLOAT_COLOR",domain="CORNER")
    tint.data.foreach_set("color",tints[np.repeat(np.arange(len(sides)),sides)].ravel())
    data.color_attributes.active_color = tint
    data.color_attributes.render_color_index = data.color_attributes.active_color_index  # the exporter reads this one
    for i,material in enumerate(data.materials):
        if material and material.name in merged: data.materials[i] = merged[material.name][0]
    mesh = bpy.data.objects.new(original.name+" export",data)
    scene.collection.objects.link(mesh)
    objects.append(mesh)

bpy.ops.object.select_all(action='DESELECT')
for obj in objects: obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.join()
room = bpy.context.object
room.name="Headquarters"
# MikkTSpace requires triangles or quads, including on the batched furniture.
triangulate = room.modifiers.new("Triangulate n-gons for tangents","TRIANGULATE")
triangulate.min_vertices = 5
bpy.ops.object.modifier_apply(modifier=triangulate.name)

# Lighting gets its own non-overlapping UV set (glTF TEXCOORD_1); materials keep UVMap.
LIGHTMAP = 2048
layout = room.data.uv_layers.new(name="Lighting")
room.data.uv_layers["UVMap"].active_render = True
room.data.uv_layers.active = layout
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=0.,area_weight=0.,correct_aspect=True,scale_to_bounds=False)
bpy.ops.uv.pack_islands(rotate=True,scale=True,margin_method="FRACTION",margin=6/LIGHTMAP)
bpy.ops.object.mode_set(mode="OBJECT")

# Bake everything except direct sunlight, which the game renders live with its shadows:
# one pass with the sun off, one with only the sun's bounces.
devices = bpy.context.preferences.addons['cycles'].preferences
for backend in ('OPTIX','CUDA'):
    try:
        devices.compute_device_type = backend
        devices.refresh_devices()
        if any(d.type==backend for d in devices.devices):
            for d in devices.devices: d.use = d.type==backend
            scene.cycles.device = 'GPU'
            break
    except (TypeError,RuntimeError):
        continue
scene.render.engine = "CYCLES"
scene.cycles.samples = 512
for obj in scene.objects:
    if obj is not room and obj.type in {"MESH","CURVE","FONT","SURFACE"}: obj.hide_render = True
sun = next(o for o in scene.objects if o.type=="LIGHT" and o.data.type=="SUN" and not o.hide_render)
lamps = [o for o in scene.objects if o.type=="LIGHT" and o is not sun and not o.hide_render]
world = next(n for n in scene.world.node_tree.nodes if n.type=="BACKGROUND")
materials = {slot.material for slot in room.material_slots if slot.material}
target = bpy.data.images.new("Lighting",LIGHTMAP,LIGHTMAP,alpha=False,float_buffer=True)
target.colorspace_settings.name = "Non-Color"
bake_nodes = []
for m in materials:
    node = m.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = target
    m.node_tree.nodes.active = node
    bake_nodes.append((m.node_tree,node))
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
bpy.context.view_layer.objects.active = room
def bake(passes):
    bpy.ops.object.bake(type="DIFFUSE",pass_filter=passes,margin=3,use_clear=True)
    values = np.empty(LIGHTMAP*LIGHTMAP*4,dtype=np.float32)
    target.pixels.foreach_get(values)
    return values.reshape(LIGHTMAP,LIGHTMAP,4)[:,:,:3].copy()
sun.hide_render = True
lighting = bake({"DIRECT","INDIRECT"})
sun.hide_render = False
for lamp in lamps: lamp.hide_render = True
world.inputs["Strength"].default_value = 0
for m in materials:
    for n in m.node_tree.nodes:
        if n.type=="EMISSION": n.inputs["Strength"].default_value = 0
lighting += bake({"INDIRECT"})
for tree,node in bake_nodes: tree.nodes.remove(node)
room.data.uv_layers.active = room.data.uv_layers["UVMap"]  # tangents follow the material UVs

# Diffuse bakes are irradiance/π; store a 0..1 range in sRGB steps and let three.js scale
# it back (lightMapIntensity multiplies irradiance, which its Lambert term divides by π).
lit = lighting.max(axis=2)
scale = float(np.percentile(lit[lit>0],99.5))
x = np.clip(lighting/scale,0,1)
x = np.where(x<=.0031308,12.92*x,1.055*np.power(x,1/2.4)-.055)
encoded = bpy.data.images.new("Lighting encoded",LIGHTMAP,LIGHTMAP,alpha=False)
encoded.colorspace_settings.name = "Non-Color"
encoded.pixels.foreach_set(np.concatenate([x,np.ones((LIGHTMAP,LIGHTMAP,1),dtype=np.float32)],axis=2).ravel())
encoded.filepath_raw = str(lightmap_output)
encoded.file_format = "WEBP"
encoded.save(quality=90)
direction = (sun.matrix_world.to_3x3()@Vector((0,0,-1))).normalized()
cam["lighting"] = {"intensity":scale*math.pi,"sunDirection":[direction.x,direction.z,-direction.y],
                   "sunColor":list(sun.data.color),"sunStrength":sun.data.energy}

for name,(image,color,rough,metal,glow) in plan.items():
    m = bpy.data.materials[name]
    tree = m.node_tree
    tree.nodes.clear()
    bs = tree.nodes.new("ShaderNodeBsdfPrincipled")
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(bs.outputs[0],out.inputs["Surface"])
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tree.links.new(tex.outputs['Color'],bs.inputs["Base Color"])
    if glow:
        tree.links.new(tex.outputs['Color'],bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = glow
    m["surfaceTint"] = color
    if name in parquet:
        detail = tree.nodes.new("ShaderNodeTexImage")
        detail.image = wood_normal
        normal = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(detail.outputs["Color"],normal.inputs["Color"])
        tree.links.new(normal.outputs["Normal"],bs.inputs["Normal"])
for keep in {keep for keep,_ in merged.values()}:
    names = sorted(n for n,(k,_) in merged.items() if k==keep)
    stems = {n.split(" · ")[0] for n in names}
    keep.name = stems.pop() if len(stems)==1 else " + ".join(names)
    del keep["surfaceTint"]

# Every texture ships as WebP: lossless for the grain normals and the white texel,
# visually transparent lossy compression for colour.
with TemporaryDirectory() as tmp:
    for image in {n.image for m in bpy.data.materials if m.use_nodes and m.users for n in m.node_tree.nodes if n.type=="TEX_IMAGE" and n.image}:
        copy = bpy.data.images.new(image.name+" webp",*image.size,alpha=False)
        copy.colorspace_settings.name = image.colorspace_settings.name
        values = np.empty(len(image.pixels),dtype=np.float32)
        image.pixels.foreach_get(values)
        copy.pixels.foreach_set(values)
        copy.filepath_raw = str(Path(tmp)/(bpy.path.clean_name(image.name)+".webp"))
        copy.file_format = "WEBP"
        copy.save(quality=100 if image in (wood_normal,white) else 90)
        webp = bpy.data.images.load(copy.filepath_raw)
        webp.colorspace_settings.name = image.colorspace_settings.name
        webp.pack()
        image.user_remap(webp)
        name = image.name
        image.name = name+" source"
        webp.name = name

def finish(source,target):
    """Keep tangents only where a normal map reads them, and meshopt-compress the vertex
    colours, which the Blender exporter writes raw (it skips normalized uint16 colours)."""
    from io_scene_gltf2.io.exp.meshopt import MeshoptEncoder
    glb = source.read_bytes()
    size = struct.unpack_from("<I",glb,12)[0]
    gltf = json.loads(glb[20:20+size])
    binary = glb[28+size:]
    assert gltf["buffers"][1]["extensions"]["EXT_meshopt_compression"]["fallback"]
    primitives = [p for mesh in gltf["meshes"] for p in mesh["primitives"]]
    for p in primitives:
        if "normalTexture" not in gltf["materials"][p["material"]]: p["attributes"].pop("TANGENT",None)
    used = sorted({i for p in primitives for i in (*p["attributes"].values(),p["indices"])})
    renumber = {old:new for new,old in enumerate(used)}
    for p in primitives:
        p["attributes"] = {k:renumber[v] for k,v in p["attributes"].items()}
        p["indices"] = renumber[p["indices"]]
    gltf["accessors"] = accessors = [gltf["accessors"][i] for i in used]
    images = gltf.get("images",[])
    kept = sorted({a["bufferView"] for a in accessors}|{image["bufferView"] for image in images})
    renumber = {old:new for new,old in enumerate(kept)}
    for item in accessors+images: item["bufferView"] = renumber[item["bufferView"]]
    gltf["bufferViews"] = views = [gltf["bufferViews"][i] for i in kept]
    colours = {a["bufferView"]:a for a in accessors if a.get("normalized") and a["componentType"]==5123 and a["type"]=="VEC4"}
    settings = {"gltf_meshopt_extension":"EXT_meshopt_compression"}
    packed,fallback = bytearray(),0
    for i,view in enumerate(views):
        meshopt = view.get("extensions",{}).get("EXT_meshopt_compression")
        if meshopt:
            chunk = binary[meshopt["byteOffset"]:meshopt["byteOffset"]+meshopt["byteLength"]]
        elif i in colours:
            plain = np.frombuffer(binary[view["byteOffset"]:view["byteOffset"]+view["byteLength"]],dtype=np.uint16).reshape(-1,4)
            chunk = MeshoptEncoder.encode_attribute("COLOR_0",plain,8,settings)[0]
            meshopt = {"buffer":0,"byteStride":8,"count":len(plain),"mode":"ATTRIBUTES"}
            view["buffer"],view["extensions"] = 1,{"EXT_meshopt_compression":meshopt}
        else:
            chunk = binary[view["byteOffset"]:view["byteOffset"]+view["byteLength"]]
            view["byteOffset"] = len(packed)
            packed += chunk+bytes(-len(chunk)%4)
            continue
        meshopt["byteOffset"],meshopt["byteLength"] = len(packed),len(chunk)
        packed += chunk+bytes(-len(chunk)%4)
        view["byteOffset"] = fallback
        fallback += view["byteLength"]+(-view["byteLength"]%4)
    gltf["buffers"][0]["byteLength"],gltf["buffers"][1]["byteLength"] = len(packed),fallback
    text = json.dumps(gltf,separators=(",",":"),ensure_ascii=False).encode()
    text += b" "*(-len(text)%4)
    target.write_bytes(struct.pack("<3I",0x46546C67,2,28+len(text)+len(packed))+struct.pack("<I",len(text))+b"JSON"+text
                       +struct.pack("<I",len(packed))+b"BIN\0"+packed)

bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
cam.select_set(True)
with TemporaryDirectory() as tmp:
    exported = Path(tmp)/"war-room.glb"
    bpy.ops.export_scene.gltf(filepath=str(exported),export_format="GLB",use_selection=True,export_image_format="AUTO",export_tangents=True,
                              export_cameras=True,export_extras=True,export_animations=False,
                              export_meshopt_compression_enable=True,export_meshopt_extension="EXT_meshopt_compression",
                              export_vertex_color="ACTIVE",export_all_vertex_colors=False)
    finish(exported,output)
print("Exported",output,output.stat().st_size,"bytes;",lightmap_output,lightmap_output.stat().st_size,"bytes",flush=True)

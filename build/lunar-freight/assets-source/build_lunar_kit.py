"""Original low-poly Lunar Freight kit, generated with Blender's bpy API.

Run with Blender 5.x: blender --background --python build_lunar_kit.py
Or install the official bpy + Pillow packages and run with Python 3.13.
All authoring helper arguments use game coordinates: X right, Y up, -Z front.
"""
from pathlib import Path
import math
import json
import bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "assets"
OUT.mkdir(parents=True, exist_ok=True)
ATLAS = HERE / "lunar-atlas.png"
NAMES = ("RoverBody", "Wheel", "Habitat", "NPC", "Cargo")

# Sixteen padded atlas swatches, including hand-authored functional surface detail.
palette = [(173,184,181), (41,84,83), (47,56,62), (22,28,32),
           (209,149,48), (44,115,138), (49,60,71), (201,97,38),
           (57,67,73), (28,63,80), (66,74,78), (212,218,202),
           (122,219,223), (145,155,151), (105,66,36), (30,42,49)]
im = Image.new("RGB", (512,512))
draw = ImageDraw.Draw(im)
font = ImageFont.load_default(size=13)
for tile, color in enumerate(palette):
    x, y = (tile % 4)*128, (tile//4)*128
    draw.rectangle((x,y,x+127,y+127), fill=color)
    if tile in (0,1,2,6,7,10,11,13,14,15):
        rim = tuple(max(0,c-27) for c in color)
        draw.rounded_rectangle((x+7,y+7,x+120,y+120), radius=6, outline=rim, width=3)
        draw.line((x+13,y+12,x+113,y+12), fill=tuple(min(255,c+23) for c in color), width=2)
        for dx in (15,112):
            for dy in (17,111):
                draw.ellipse((x+dx-2,y+dy-2,x+dx+2,y+dy+2), fill=(30,39,41))
        draw.line((x+27,y+101,x+63,y+101), fill=rim, width=2)
        draw.rectangle((x+82,y+94,x+108,y+98), fill=(194,206,195))
    if tile == 3:
        for dy in range(8,126,15):
            draw.line((x+6,y+dy,x+120,y+dy+8),fill=(37,43,44),width=4)
    if tile == 4:
        for dx in range(-128,256,36):
            draw.polygon([(x+dx,y),(x+dx+17,y),(x+dx+145,y+128),(x+dx+128,y+128)],fill=(38,42,40))
    if tile == 5:
        for dy in range(5,120):
            shade = int(17*(1-dy/128))
            draw.line((x+5,y+dy,x+122,y+dy),fill=(39+shade,94+shade,110+shade))
        draw.polygon([(x+18,y+20),(x+39,y+17),(x+103,y+95),(x+82,y+98)],fill=(92,147,156))
        draw.line((x+15,y+110,x+113,y+110),fill=(150,190,185),width=3)
    if tile == 8:
        for dy in range(15,116,12):
            draw.rectangle((x+13,y+dy,x+114,y+dy+5),fill=(16,26,31))
            draw.line((x+14,y+dy+6,x+113,y+dy+6),fill=(87,99,99),width=1)
    if tile == 9:
        for dx in range(10,124,23):
            draw.line((x+dx,y+9,x+dx,y+119),fill=(95,132,140),width=2)
        for dy in range(9,123,18):
            draw.line((x+9,y+dy,x+119,y+dy),fill=(89,116,124),width=1)
    if tile in (1,7,11):
        draw.rectangle((x+20,y+34,x+108,y+75),fill=(31,48,53))
        draw.text((x+27,y+45), "LF / 07" if tile != 11 else "AIRLOCK",font=font,fill=(205,222,211))
    if tile == 12:
        draw.rectangle((x+9,y+39,x+118,y+88),fill=(185,242,226))
# Repaint padding after angled hazard drawing so tiles cannot bleed into neighbors.
for tile, color in enumerate(palette):
    x,y=(tile%4)*128,(tile//4)*128
    draw.rectangle((x,y,x+127,y+127),outline=color,width=4)
im.save(ATLAS,optimize=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
source_scene = bpy.context.scene
source_scene.name = "Kit_Export_Local_Origins"
texture = bpy.data.images.load(str(ATLAS)); texture.name = "Lunar_Atlas_512"; texture.pack()

def material(name, metallic, roughness, emission=0):
    mat=bpy.data.materials.new(name); mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get("Principled BSDF")
    image=mat.node_tree.nodes.new("ShaderNodeTexImage"); image.image=texture
    image.interpolation="Linear"; image.extension="EXTEND"
    mat.node_tree.links.new(image.outputs["Color"],bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value=metallic
    bsdf.inputs["Roughness"].default_value=roughness
    if emission:
        mat.node_tree.links.new(image.outputs["Color"],bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value=emission
    return mat

mats={"alloy":material("Atlas / painted alloy",.32,.64),
      "rubber":material("Atlas / rubber and fabric",.02,.9),
      "visor":material("Atlas / coated visor",.72,.23),
      "light":material("Atlas / status light",.1,.32,.7)}

def game(p): return (p[0],-p[2],p[1])
def size(s): return (s[0],s[2],s[1])

def uv_and_material(obj,tile,kind="alloy"):
    obj.data.materials.append(mats[kind])
    uv=obj.data.uv_layers.new(name="AtlasUV") if not obj.data.uv_layers else obj.data.uv_layers[0]
    bounds=[(min(v.co[a] for v in obj.data.vertices),max(v.co[a] for v in obj.data.vertices)) for a in range(3)]
    for face in obj.data.polygons:
        axis=max(range(3),key=lambda a:abs(face.normal[a]))
        axes=[a for a in range(3) if a != axis]
        for li in face.loop_indices:
            co=obj.data.vertices[obj.data.loops[li].vertex_index].co
            p=[(co[a]-bounds[a][0])/max(.00001,bounds[a][1]-bounds[a][0]) for a in axes]
            # Sample within the 4 px gutters. Blender UVs start at the bottom.
            uv.data[li].uv=((tile%4+(5+118*p[0])/128)/4,
                            (3-tile//4+(5+118*p[1])/128)/4)

current=[]
def finish(obj,name,tile,kind="alloy",bevel=0):
    obj.name=name
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new("Small manufactured edge","BEVEL")
        mod.width=bevel; mod.segments=1; mod.affect="EDGES"
        bpy.ops.object.modifier_apply(modifier=mod.name)
    uv_and_material(obj,tile,kind)
    current.append(obj)
    return obj

def box(name,p,s,tile,kind="alloy",bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=game(p))
    ob=bpy.context.object; ob.dimensions=size(s)
    return finish(ob,name,tile,kind,bevel)

def cylinder(name,p,radius,depth,tile,axis="y",kind="alloy",vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=game(p))
    ob=bpy.context.object
    if axis=="x": ob.rotation_euler[1]=math.pi/2
    elif axis=="z": ob.rotation_euler[0]=math.pi/2
    return finish(ob,name,tile,kind,.008)

def sphere(name,p,s,tile,kind="alloy"):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=game(p))
    ob=bpy.context.object; ob.dimensions=size(s)
    return finish(ob,name,tile,kind)

def poly(name,vertices,faces,tile,kind="alloy"):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata([game(v) for v in vertices],[],faces); mesh.update()
    ob=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(ob)
    uv_and_material(ob,tile,kind); current.append(ob); return ob

roots={}
def complete_group(name):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in current: obj.select_set(True)
    bpy.context.view_layer.objects.active=current[0]
    bpy.ops.object.join()
    ob=bpy.context.object; ob.name=name+"_Geometry"
    bpy.context.scene.cursor.location=(0,0,0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    root=bpy.data.objects.new(name,None); source_scene.collection.objects.link(root)
    ob.parent=root
    root["asset_type"]=name
    root["front"]="-Z in glTF / Three.js"
    roots[name]=root; current.clear()

# Rover: flat rear utility deck, angled enclosed front cab, exposed underframe.
box("Chassis",(0,.06,0),(1.94,.4,3.66),2,bevel=.07)
box("Keel",(0,-.16,.12),(1.16,.18,3.45),3,"rubber",.025)
box("Cargo deck",(0,.32,.53),(2.16,.19,2.61),0,bevel=.04)
box("Rear bumper",(0,.12,1.85),(2.3,.19,.2),2,bevel=.025)
box("Front bumper",(0,.07,-1.85),(2.3,.22,.2),1,bevel=.025)
box("Rear warning",(0,.21,1.954-.015),(1.65,.075,.02),4,bevel=0)
for x in (-1.025,1.025):
    box("Deck sidewall",(x,.5,.7),(.12,.3,2.3),1,bevel=.025)
    box("Deck rail",(x,.78,.75),(.12,.09,2.1),2,bevel=.018)
    for z in (-.15,.72,1.6): box("Rail post",(x,.66,z),(.1,.25,.1),0)
    box("Side orange line",(x*1.02,.4,.64),(.04,.06,2.15),7,bevel=0)
for z in (-1.18,1.18):
    box("Axle receiver",(0,-.07,z),(2.15,.18,.2),2)
    for x in (-1,1): box("Wheel arch",(x,.33,z),(.3,.14,.88),1,bevel=.025)
# Convex eight-corner sloped cabin. x right; front at z negative.
poly("Cab shell",[(-.79,.34,-1.68),(.79,.34,-1.68),(.79,.34,-.25),(-.79,.34,-.25),
                  (-.69,1.37,-1.36),(.69,1.37,-1.36),(.69,1.37,-.36),(-.69,1.37,-.36)],
     [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],0)
poly("Wide windshield",[(-.635,.77,-1.557),(.635,.77,-1.557),(.612,1.25,-1.408),(-.612,1.25,-1.408)],[(3,2,1,0)],5,"visor")
box("Windshield divider",(0,1.015,-1.494),(.047,.52,.04),2,bevel=.01).rotation_euler[0]=-.297
for sign in (-1,1):
    poly("Side window",[(sign*.763,.73,-1.42),(sign*.762,.73,-.42),(sign*.701,1.25,-.43),(sign*.701,1.25,-1.27)],
         [(0,1,2,3)] if sign<0 else [(3,2,1,0)],5,"visor")
    box("Cab door lower",(sign*.8,.5,-.9),(.04,.26,.91),1,bevel=.015)
    box("Door handle",(sign*.83,.67,-.5),(.05,.05,.18),11,bevel=.01)
    box("Headlight",(sign*.75,.37,-1.78),(.4,.13,.1),12,"light",.025)
    box("Mirror stalk",(sign*.89,.95,-1.13),(.27,.04,.055),2,bevel=.005)
    box("Mirror",(sign*1.055,.99,-1.13),(.13,.19,.1),5,"visor",.02)
box("Cab roof",(0,1.407,-.86),(1.49,.105,1.09),1,bevel=.035)
box("Cab roof light",(0,1.473,-1.15),(.64,.054,.12),12,"light",.01)
box("Rear cab vent",(0,.86,-.223),(1.01,.54,.04),8,bevel=.012)
for x in (-.64,.64):
    box("Rear beacon",(x,.61,1.89),(.2,.15,.075),7,"light",.02)
complete_group("RoverBody")

# Separate X-axis wheel, centered for chassis animation.
cylinder("Tire",(0,0,0),.543,.37,3,"x","rubber",28)
for angle in [i*2*math.pi/28 for i in range(28)]:
    ob=box("Tread",(0,math.cos(angle)*.545,math.sin(angle)*.545),(.39,.043,.11),3,"rubber",.003)
    ob.rotation_euler[0]=-angle
for x in (-.19,.19):
    cylinder("Rim",(x,0,0),.332,.008,13,"x",vertices=24)
    cylinder("Hub",(x*1.015,0,0),.143,.004,1,"x",vertices=12)
    for angle in [i*math.pi/3 for i in range(6)]:
        cylinder("Hub bolt",(x*1.02,math.cos(angle)*.24,math.sin(angle)*.24),.025,.002,2,"x",vertices=6)
complete_group("Wheel")

# Normalized habitat; all geometry remains in [-.5,.5]^3.
box("Unit core",(0,-.03,0),(.96,.83,.94),0,bevel=.035)
box("Base sill",(0,-.465,0),(1,.07,1),2,bevel=.01)
box("Roof rim",(0,.413,0),(1,.06,1),1,bevel=.01)
box("Solar array",(-.16,.457,.015),(.59,.045,.79),9,bevel=.008)
box("Roof exchanger",(.303,.456,.17),(.21,.056,.41),8,bevel=.008)
box("Roof light",(.315,.485,-.32),(.21,.03,.07),12,"light",.004)
box("Airlock surround",(0,-.115,-.481),(.36,.62,.024),2,bevel=.018)
box("Airlock",(0,-.13,-.495),(.272,.52,.009),11,bevel=.004)
box("Door seam",(0,-.135,-.4995),(.008,.48,.001),2,bevel=0)
box("Door hazard lintel",(0,.203,-.49),(.4,.045,.018),4,bevel=0)
box("Airlock display",(.204,-.04,-.487),(.04,.1,.022),12,"light",.004)
for x in (-.457,.457):
    for z in (-.448,.448): box("Corner spine",(x,-.04,z),(.065,.85,.065),1,bevel=.009)
for x in (-.485,.485):
    for z in (-.225,.2):
        box("Side window surround",(x,.09,z),(.019,.3,.26),2,bevel=.015)
        box("Side window",(x*1.021,.095,z),(.005,.21,.19),5,"visor",.006)
    box("Service rail",(x,-.295,.03),(.02,.07,.75),1,bevel=.005)
box("Rear machinery",(0,-.06,.483),(.66,.56,.031),8,bevel=.015)
complete_group("Habitat")

# Unrigged standing courier silhouette, feet Y=0 and crown Y=1.8.
for x in (-.115,.115):
    box("Boot",(x,.09,-.045),(.19,.18,.34),3,"rubber",.035)
    box("Shin",(x,.34,0),(.165,.39,.19),6,"rubber",.035)
    box("Shin plate",(x,.37,-.101),(.137,.24,.027),1,bevel=.018)
    box("Knee",(x,.56,-.045),(.19,.145,.18),2,bevel=.027)
    box("Upper leg",(x,.74,.016),(.193,.29,.23),6,"rubber",.035)
    box("Thigh strap",(x,.78,.014),(.208,.055,.243),7,"rubber",.008)
box("Hip harness",(0,.925,.01),(.425,.19,.28),2,"rubber",.03)
box("Torso",(0,1.18,0),(.47,.42,.3),6,"rubber",.055)
box("Chest armor",(0,1.23,-.172),(.37,.28,.048),1,bevel=.025)
box("Chest status",(-.105,1.25,-.202),(.053,.036,.013),12,"light",.005)
for x in (-.17,.17): box("Shoulder harness",(x,1.19,-.188),(.038,.34,.03),7,"rubber",.01)
cylinder("Collar",(0,1.425,0),.175,.08,2,vertices=16)
sphere("Helmet shell",(0,1.614,-.005),(.4,.372,.375),0)
sphere("Reflective faceplate",(0,1.625,-.088),(.33,.25,.26),5,"visor")
box("Helmet brow",(0,1.739,-.099),(.3,.036,.16),2,bevel=.012)
for sign in (-1,1):
    sphere("Shoulder",(sign*.305,1.34,0),(.2,.24,.24),1)
    ob=box("Upper arm",(sign*.322,1.165,.0),(.16,.25,.18),6,"rubber",.03); ob.rotation_euler[1]=sign*.11
    sphere("Elbow",(sign*.349,1.026,-.015),(.155,.15,.17),2)
    ob=box("Forearm",(sign*.36,.936,-.045),(.155,.22,.18),6,"rubber",.025); ob.rotation_euler[0]=-.15
    box("Glove",(sign*.363,.787,-.064),(.147,.14,.173),3,"rubber",.025)
    box("Suit shoulder mark",(sign*.405,1.32,-.016),(.016,.10,.11),4,bevel=.003)
box("Backpack frame",(0,1.17,.225),(.44,.57,.12),2,bevel=.025)
box("Backpack cargo",(0,1.235,.376),(.365,.42,.22),7,bevel=.035)
box("Pack strap",(0,1.235,.494),(.055,.435,.018),3,"rubber",.005)
for x in (-.167,.167): cylinder("Oxygen canister",(x,1.024,.371),.059,.25,13,vertices=12)
complete_group("NPC")

# Small stackable hard-case freight container with visible restraint straps.
box("Case body",(0,0,0),(.59,.55,.69),7,bevel=.04)
box("Case top",(0,.29,0),(.6,.04,.7),0,bevel=.009)
box("Case bottom",(0,-.29,0),(.6,.04,.7),2,bevel=.009)
for x in (-.189,.189):
    box("Top strap",(x,.303,0),(.045,.014,.69),3,"rubber",.004)
    box("Bottom strap",(x,-.303,0),(.045,.014,.69),3,"rubber",.004)
    for z in (-.341,.341): box("Vertical strap",(x,0,z),(.045,.578,.012),3,"rubber",.003)
for x in (-.28,.28):
    box("Handle recess",(x,.08,0),(.034,.13,.29),2,bevel=.01)
    box("Carry handle",(x*1.035,.08,0),(.017,.044,.23),13,bevel=.005)
box("Freight ID",(0,.055,-.3495),(.24,.16,.001),11,bevel=0)
complete_group("Cargo")

# Make normals consistent and write the source scene without hidden transforms.
for root in roots.values():
    mesh=root.children[0]
    bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.select_all(action="DESELECT"); mesh.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
    mesh.data.calc_loop_triangles()
stats={name:{"triangles":len(root.children[0].data.loop_triangles),
             "bounds_game":[[round(min(v.co[a]*sign for v in root.children[0].data.vertices),5),
                             round(max(v.co[a]*sign for v in root.children[0].data.vertices),5)] for a,sign in ((0,1),(2,1),(1,-1))]}
       for name,root in roots.items()}
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUT/"lunar-kit.glb"),export_format="GLB",use_selection=True,
    export_yup=True,export_apply=True,export_texcoords=True,export_normals=True,export_materials="EXPORT",
    export_cameras=False,export_lights=False,export_extras=True,export_animations=False)

# One optional still in a separate scene; no animation or pre-rendered game footage.
preview=bpy.data.scenes.new("Kit_Still_Preview")
bpy.context.window.scene=preview
def instance(name,loc,scale=(1,1,1),turn=0):
    old=roots[name]
    root=old.copy(); root.name="Preview_"+name; preview.collection.objects.link(root)
    root.location=game(loc); root.scale=size(scale); root.rotation_euler[2]=-turn
    for mesh in old.children:
        child=mesh.copy(); child.data=mesh.data; preview.collection.objects.link(child); child.parent=root
    return root
instance("RoverBody",(-1.3,.81,0))
for x in (-1.15,1.15):
    for z in (-1.18,1.18): instance("Wheel",(-1.3+x,.57,z))
instance("Habitat",(2.15,1.35,2.7),(2.5,2.7,2.5))
instance("NPC",(1.8,0,-1))
instance("Cargo",(-1.55,1.545,.75)); instance("Cargo",(-.83,1.545,.9))
instance("Cargo",(2.85,.31,-1.35))
floor_mat=bpy.data.materials.new("Preview lunar stage"); floor_mat.diffuse_color=(.085,.103,.118,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015)); floor=bpy.context.object; floor.data.materials.append(floor_mat)
world=bpy.data.worlds.new("Studio dusk"); world.use_nodes=True; world.node_tree.nodes["Background"].inputs[0].default_value=(.14,.19,.24,1); world.node_tree.nodes["Background"].inputs[1].default_value=.45; preview.world=world
def light(name,loc,power,color,area):
    data=bpy.data.lights.new(name,"AREA"); data.energy=power; data.color=color; data.shape="DISK"; data.size=area
    ob=bpy.data.objects.new(name,data); preview.collection.objects.link(ob); ob.location=game(loc)
    ob.rotation_euler=(Vector(game((0,0,0)))-ob.location).to_track_quat("-Z","Y").to_euler()
light("Warm key",(-5,9,-7),1800,(1,.85,.7),6)
light("Cool fill",(6,6,-1),1300,(.57,.8,1),5)
light("Edge",(0,7,8),1800,(.8,1,1),4)
cam_data=bpy.data.cameras.new("Kit camera"); cam=bpy.data.objects.new("Kit camera",cam_data); preview.collection.objects.link(cam)
cam.location=game((8,6,-10)); cam.rotation_euler=(Vector(game((.3,1,1)))-cam.location).to_track_quat("-Z","Y").to_euler()
cam_data.type="ORTHO"; cam_data.ortho_scale=10.4; preview.camera=cam
preview.render.engine="CYCLES"; preview.cycles.device="CPU"; preview.cycles.samples=32
preview.cycles.use_denoising=True; preview.render.resolution_x=1280; preview.render.resolution_y=900; preview.render.resolution_percentage=100
preview.view_settings.view_transform="AgX"
preview.render.image_settings.file_format="PNG"; preview.render.filepath=str(HERE/"lunar-kit-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"lunar-kit.blend"),compress=True)
bpy.ops.render.render(write_still=True)
print("ASSET_BUILD_COMPLETE "+json.dumps({"blender":bpy.app.version_string,"glb_bytes":(OUT/"lunar-kit.glb").stat().st_size,"authoring":stats}))

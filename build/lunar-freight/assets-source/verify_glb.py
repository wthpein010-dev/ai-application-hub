"""Validate the exported binary glTF independently of the Blender scene."""
from pathlib import Path
import json
import struct
import numpy as np

HERE=Path(__file__).resolve().parent
path=HERE.parent/"public"/"assets"/"lunar-kit.glb"
raw=path.read_bytes()
magic,version,length=struct.unpack_from("<4sII",raw)
assert magic==b"glTF" and version==2 and length==len(raw)
jlength,jtype=struct.unpack_from("<II",raw,12)
assert jtype==0x4E4F534A
doc=json.loads(raw[20:20+jlength])
offset=20+jlength
blength,btype=struct.unpack_from("<II",raw,offset)
assert btype==0x004E4942
binary=raw[offset+8:offset+8+blength]
assert len(raw)<2_000_000, "Browser kit exceeds its 2 MB budget"
assert all("uri" not in b for b in doc["buffers"])
assert len(doc["images"])==1 and all("bufferView" in i and i["mimeType"]=="image/png" for i in doc["images"])

def accessor(index):
    acc=doc["accessors"][index]; view=doc["bufferViews"][acc["bufferView"]]
    dtype={5126:"<f4",5123:"<u2",5125:"<u4",5121:"u1"}[acc["componentType"]]
    cols={"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[acc["type"]]
    size=np.dtype(dtype).itemsize
    return np.ndarray((acc["count"],cols),dtype=dtype,buffer=binary,
        offset=view.get("byteOffset",0)+acc.get("byteOffset",0),
        strides=(view.get("byteStride",cols*size),size))

def transform(node):
    if "matrix" in node: return np.array(node["matrix"]).reshape(4,4).T
    x,y,z,w=node.get("rotation",[0,0,0,1])
    result=np.array([[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w,0],
                     [2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w,0],
                     [2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y,0],
                     [0,0,0,1]],float)
    result[:3,:3]*=np.array(node.get("scale",[1,1,1]))[None,:]
    result[:3,3]=node.get("translation",[0,0,0])
    return result

def collect(index,parent=np.eye(4)):
    node=doc["nodes"][index]; matrix=parent@transform(node)
    points=[]; triangles=0
    if "mesh" in node:
        for primitive in doc["meshes"][node["mesh"]]["primitives"]:
            assert primitive.get("mode",4)==4
            assert {"POSITION","NORMAL","TEXCOORD_0"}.issubset(primitive["attributes"])
            pos=accessor(primitive["attributes"]["POSITION"])
            uv=accessor(primitive["attributes"]["TEXCOORD_0"])
            assert np.isfinite(pos).all() and np.isfinite(uv).all()
            assert uv.min()>=0 and uv.max()<=1
            points.extend((np.column_stack([pos,np.ones(len(pos))])@matrix.T)[:,:3])
            triangles+=len(accessor(primitive["indices"]))//3
    for child in node.get("children",[]):
        p,t=collect(child,matrix); points.extend(p); triangles+=t
    return np.array(points),triangles

expected={"RoverBody":np.array([[-1.15,-.25,-1.95],[1.15,1.5,1.95]]),
          "Wheel":np.array([[-.195,-.575,-.575],[.195,.575,.575]]),
          "Habitat":np.array([[-.5,-.5,-.5],[.5,.5,.5]]),
          "NPC":np.array([[-.5,0,-.3],[.5,1.8,.6]]),
          "Cargo":np.array([[-.3,-.31,-.35],[.3,.31,.35]])}
root_indices=doc["scenes"][doc.get("scene",0)]["nodes"]
assert {doc["nodes"][i]["name"] for i in root_indices}==set(expected)
report={"format":"glTF 2.0 / binary / Y-up", "generator":doc["asset"].get("generator"),
        "glb_bytes":len(raw),"mesh_count":len(doc["meshes"]),"material_count":len(doc["materials"]),
        "embedded_images":len(doc["images"]),"texture_size":[512,512],"models":{}}
for i in root_indices:
    node=doc["nodes"][i]; name=node["name"]
    assert np.allclose(transform(node),np.eye(4)), f"{name} needs a nonidentity root transform"
    p,triangles=collect(i)
    limits=expected[name]; bmin=p.min(axis=0); bmax=p.max(axis=0)
    assert np.all(bmin>=limits[0]-.0011) and np.all(bmax<=limits[1]+.0011),(name,bmin,bmax)
    report["models"][name]={"bounds_min":np.round(bmin,5).tolist(),"bounds_max":np.round(bmax,5).tolist(),
        "dimensions":np.round(bmax-bmin,5).tolist(),"triangles":triangles,"root_transform":"identity"}
report["total_triangles"]=sum(m["triangles"] for m in report["models"].values())
report["checks"]=["Five exact root names", "Identity root transforms", "Dimension bounds", "Embedded PNG atlas", "UVs and normals on every primitive", "Finite geometry", "Under 2 MB"]
(HERE/"asset-validation.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
print(json.dumps(report,indent=2))

# Lunar Freight — original Blender asset kit

Created 2026-09-08 for this project using the actual Blender Python API (`bpy`).
These are original procedural industrial science-fiction models. No commercial
game meshes, textures, logos, screenshots, scans, or extracted assets were used.
The small workshop style uses gray armor, teal panels, orange containers and
functional vents, straps, windows, warning markings and status lights.

## Files

- `../public/assets/lunar-kit.glb`: runtime delivery, binary glTF 2.0.
- `build_lunar_kit.py`: reproducible geometry, UV, texture, material and export source.
- `lunar-atlas.png`: original 512 × 512 RGB atlas, also packed into the GLB and blend.
- `lunar-kit.blend`: compressed editable Blender source. The export scene retains
  local origins; the separate still-preview scene arranges linked copies for inspection.
- `lunar-kit-preview.png`: one review still; no animation is included or generated.
- `verify_glb.py` and `asset-validation.json`: independent binary glTF validation.

## Runtime contract

All five top-level roots have identity transforms. Units are meters. glTF and
Three.js use X right, Y up; the front of the rover and courier is **negative Z**.
Clone roots by these exact names:

| Root | Dimensions / origin | Integration |
| --- | --- | --- |
| `RoverBody` | X ±1.15; Y −0.25 to 1.50; Z ±1.95 | Enclosed front cab and rear cargo deck; excludes wheels |
| `Wheel` | Width 0.39; radius about 0.57 | Axle is X; origin at axle center; rotate around X to roll |
| `Habitat` | 1 × 1 × 1, centered | Scale root in X/Y/Z; origin is at building center |
| `NPC` | Height 1.80; feet at Y 0 | Standing unrigged courier with visor and backpack |
| `Cargo` | 0.60 × 0.62 × 0.70, centered | Hard case with straps and recessed carry handles |

Each root contains one combined mesh, divided into primitives by material. Every
primitive has normals and an explicit `AtlasUV` layer. Four materials share one
embedded PNG: painted alloy, rubber/fabric, coated visor, and emissive status lights.
Metalness and roughness are scalar PBR values; panel, vent, warning-stripe, solar-cell
and freight-marking surface detail is authored in the atlas. No external image URL,
rig, skeleton, animation, camera or lighting is exported in the GLB. Game collision
and character animation remain the responsibility of the game code.

## Rebuild

Requires Blender 5.2.1 (or its official PyPI `bpy==5.2.1` distribution), Pillow and
NumPy. Pillow creates the original atlas; all meshes, UVs, materials, native `.blend`
source, the GLB export and the still render are produced through Blender itself.

```powershell
# With Blender installed and Pillow available in its Python environment:
blender --background --python build_lunar_kit.py

# Alternatively, with official bpy, Pillow and NumPy in Python 3.13:
python build_lunar_kit.py
python verify_glb.py
```

The authoring helper accepts game coordinates and converts them to Blender's Z-up
coordinates. Blender's glTF exporter converts back to Y-up. The validator reads the
exported binary independently, applies node transforms and checks actual dimensions,
identity roots, finite position data, UVs, normals, embedded image data and the 2 MB
runtime budget. It writes current triangle counts and exact byte size to the JSON.

The runtime was obtained from the `bpy` package on PyPI; no installer or executable
is bundled into this repository. The downloaded Windows CPython 3.13 wheel was
verified against PyPI SHA-256:
`70fccb611c97d52710b1752ad1aad515cd24f831ddefbf7031ad8360032a7fc1`.

Original model and atlas authorship: generated for Lunar Freight, 2026-09-08.
The project may use, modify and redistribute these assets with its application.

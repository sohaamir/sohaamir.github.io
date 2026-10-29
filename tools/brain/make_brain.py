"""Turn a skull-stripped brain (bet output) into a low-poly binary glTF.

Usage: make_brain.py <brain_mask.nii.gz> <out.glb> [--brain brain.nii.gz] [--target-faces 10000]

Run with FSL's python ($FSLDIR/bin/python): it has nibabel, scikit-image,
scipy, trimesh and vtk. Only the brain surface leaves this script: everything
is restricted to bet's brain mask, so no face/skin geometry can be exported.

Pipeline:
  1. Mask (optionally carved: drop dark sulcal CSF inside the mask using the
     skull-stripped T1, so gyri and the midline fissure show), Gaussian
     smoothed with sigma = 1 voxel.
  2. Marching cubes at level 0.5 (step_size 1 keeps sulci; see 3).
  3. Voxel -> world affine; keep the largest connected piece; quadric
     decimation down to --target-faces (a coarse marching-cubes step_size
     reaches the budget too, but erases every sulcus).
  4. Taubin smoothing.
  5/6. Orient superior = +Y, anterior = -Z; centre on the origin and scale to
     unit bounding-box height.
  7. Binary glTF. Exits 1 if the face count is outside 5k-15k.
"""

import argparse
import sys

import nibabel as nib
import numpy as np
import trimesh
from scipy.ndimage import gaussian_filter
from skimage.filters import threshold_multiotsu
from skimage.measure import marching_cubes

MIN_FACES = 5_000
MAX_FACES = 15_000


def carve(mask: np.ndarray, t1: np.ndarray, frac: float) -> np.ndarray:
    """Keep tissue brighter than CSF. Threshold sits `frac` of the way from the
    CSF/GM to the GM/WM multi-Otsu threshold of the in-mask intensities."""
    csf_gm, gm_wm = threshold_multiotsu(t1[mask], classes=3)
    t = csf_gm + frac * (gm_wm - csf_gm)
    print(f"  carve threshold {t:.1f} (multi-Otsu {csf_gm:.1f}, {gm_wm:.1f})", file=sys.stderr)
    return mask & (t1 > t)


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    """Quadric decimation with VTK (bundled with FSL's python)."""
    import vtk
    from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy

    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(mesh.vertices.astype(np.float64), deep=True))
    cells = np.hstack([np.full((len(mesh.faces), 1), 3), mesh.faces]).astype(np.int64).ravel()
    polys = vtk.vtkCellArray()
    polys.SetCells(len(mesh.faces), numpy_to_vtkIdTypeArray(cells, deep=True))
    poly = vtk.vtkPolyData()
    poly.SetPoints(points)
    poly.SetPolys(polys)

    dec = vtk.vtkQuadricDecimation()
    dec.SetInputData(poly)
    dec.SetTargetReduction(1.0 - target / len(mesh.faces))
    dec.VolumePreservationOn()
    dec.Update()
    out = dec.GetOutput()
    verts = vtk_to_numpy(out.GetPoints().GetData())
    faces = vtk_to_numpy(out.GetPolys().GetData()).reshape(-1, 4)[:, 1:]
    return trimesh.Trimesh(vertices=verts, faces=faces, process=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mask", help="bet brain mask (brain_mask.nii.gz)")
    ap.add_argument("out", help="output .glb")
    ap.add_argument("--brain", help="bet skull-stripped T1 (brain.nii.gz); carves sulci if given")
    ap.add_argument("--carve-frac", type=float, default=0.5)
    ap.add_argument("--target-faces", type=int, default=10_000)
    args = ap.parse_args()

    img = nib.load(args.mask)
    mask = np.asarray(img.dataobj) > 0
    if args.brain:
        t1 = np.asarray(nib.load(args.brain).dataobj, dtype=np.float32)
        mask = carve(mask, t1, args.carve_frac)

    # 1. Smooth the binary volume so the iso-surface is not voxel-stepped.
    smooth = gaussian_filter(mask.astype(np.float32), sigma=1.0)

    # 2. Marching cubes at 0.5.
    verts, faces, _normals, _values = marching_cubes(smooth, level=0.5, step_size=1)

    # 3. Voxel -> world (scanner RAS, mm); largest piece; decimate to budget.
    world = nib.affines.apply_affine(img.affine, verts)
    mesh = trimesh.Trimesh(vertices=world, faces=faces, process=True)
    mesh = max(mesh.split(only_watertight=False), key=lambda m: len(m.faces))
    print(f"  marching cubes: {len(mesh.faces)} faces", file=sys.stderr)
    if len(mesh.faces) > args.target_faces:
        mesh = decimate(mesh, args.target_faces)

    # 4. Taubin smoothing (no shrinkage).
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=12)

    # 6. Orient: RAS (x=right, y=anterior, z=superior) -> glTF/three
    #    (X=right, Y=superior, Z=-anterior). A proper rotation (det = +1).
    ras = mesh.vertices.copy()
    mesh.vertices = np.column_stack([ras[:, 0], ras[:, 2], -ras[:, 1]])

    # 5. Centre on the origin and scale to unit bounding-box height (Y).
    lo, hi = mesh.bounds
    mesh.vertices -= (lo + hi) / 2.0
    mesh.vertices /= (hi - lo)[1]

    # Normals must point outward (a flipped affine inverts the winding).
    outward = np.einsum("ij,ij->i", mesh.face_normals, mesh.triangles_center - mesh.centroid)
    if outward.mean() < 0:
        mesh.invert()

    n = len(mesh.faces)
    print(f"faces: {n}")
    if not MIN_FACES <= n <= MAX_FACES:
        print(f"face count {n} outside {MIN_FACES}-{MAX_FACES}", file=sys.stderr)
        return 1

    # 7. Binary glTF.
    mesh.export(args.out, file_type="glb")
    return 0


if __name__ == "__main__":
    sys.exit(main())

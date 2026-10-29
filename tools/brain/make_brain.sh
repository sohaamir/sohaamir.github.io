#!/usr/bin/env bash
# One-off: skull-strip Aamir's T1 and export a low-poly brain surface as .glb.
#
#   tools/brain/make_brain.sh [input.nii.gz] [out.glb]
#
# Needs FSL (FSLDIR set, bet). Env overrides: BET_F (default 0.5),
# TARGET_FACES (default 10000).
#
# PRIVACY: the input scan contains the face. It is read in place and never
# copied. All intermediate NIfTI files live in a temp dir OUTSIDE the repo,
# deleted on exit. Only the brain-surface .glb is written to the repo.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
IN="${1:-$HOME/Documents/GitHub/my_brain/13042026_birmingham/t1-mprage/T1_vol_MPR_v1_5.nii.gz}"
OUT="${2:-$HERE/../../public/models/brain.glb}"
BET_F="${BET_F:-0.5}"
TARGET_FACES="${TARGET_FACES:-10000}"

: "${FSLDIR:?set FSLDIR to your FSL install}"
export FSLOUTPUTTYPE=NIFTI_GZ
BET="$FSLDIR/share/fsl/bin/bet"
[ -x "$BET" ] || BET="$(command -v bet)"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/make_brain.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

echo "bet $IN $TMP/brain -f $BET_F -R -m" >&2
"$BET" "$IN" "$TMP/brain" -f "$BET_F" -R -m

"$FSLDIR/bin/python" "$HERE/make_brain.py" "$TMP/brain_mask.nii.gz" "$OUT" \
  --brain "$TMP/brain.nii.gz" --target-faces "$TARGET_FACES"

ls -l "$OUT" >&2

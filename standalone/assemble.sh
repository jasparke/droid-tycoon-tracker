#!/usr/bin/env bash
# Assemble a self-contained, deployable copy of the standalone planner into ./dist/.
#
# The droid art is single-sourced from the repo's canonical asset set
# (app/static/assets/droids) rather than duplicated in git. This script copies
# planner.html + the art it needs into dist/, which is what you rsync/scp to
# the static web root on Proxmox.
#
# Usage:  ./assemble.sh
# Output: standalone/dist/{planner.html, assets/droids/*.webp}
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/.." && pwd)"

src_html="$here/planner.html"
src_assets="$repo_root/app/static/assets/droids"
dist="$here/dist"

[ -f "$src_html" ]   || { echo "error: missing $src_html" >&2; exit 1; }
[ -d "$src_assets" ] || { echo "error: missing $src_assets (run from a full repo checkout)" >&2; exit 1; }

rm -rf "$dist"
mkdir -p "$dist/assets/droids"
cp "$src_html" "$dist/planner.html"
cp "$src_assets"/*.webp "$dist/assets/droids/"

count="$(find "$dist/assets/droids" -name '*.webp' | wc -l | tr -d ' ')"
size="$(du -sh "$dist" | cut -f1)"
echo "assembled -> $dist"
echo "  planner.html + $count webp  ($size total)"
echo
echo "next: serve $dist over http(s) — e.g."
echo "  caddy file-server --root $dist --listen :8080"
echo "  # or: docker run --rm -p 8080:80 -v \"$dist\":/usr/share/nginx/html:ro nginx:alpine"

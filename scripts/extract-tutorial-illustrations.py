#!/usr/bin/env python3
"""Extract observed tutorial regions with reproducible source provenance."""
import argparse
import hashlib
import html
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

from PIL import Image, ImageOps


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def perspective_coefficients(quad, size):
    """Map output coordinates to the observed page using an 8-parameter homography."""
    width, height = size
    matrix = []
    for (x, y), (u, v) in zip([(0, 0), (width, 0), (width, height), (0, height)], quad):
        matrix.append([x, y, 1, 0, 0, 0, -u*x, -u*y, u])
        matrix.append([0, 0, 0, x, y, 1, -v*x, -v*y, v])
    for col in range(8):
        pivot = max(range(col, 8), key=lambda row: abs(matrix[row][col]))
        matrix[col], matrix[pivot] = matrix[pivot], matrix[col]
        scale = matrix[col][col]
        if abs(scale) < 1e-10:
            raise ValueError('Degenerate page quadrilateral')
        matrix[col] = [n/scale for n in matrix[col]]
        for row in range(8):
            if row != col:
                factor = matrix[row][col]
                matrix[row] = [a-factor*b for a, b in zip(matrix[row], matrix[col])]
    return [row[8] for row in matrix]


def extract_region(im, entry):
    width, height = im.size
    units = entry.get('units', 'pixels')
    if units not in ('pixels', 'normalized'):
        raise ValueError('Invalid coordinate units')
    if 'quad' in entry:
        if 'crop' in entry:
            raise ValueError('Choose crop or quad, not both')
        quad = entry['quad']
        if len(quad) != 4 or any(len(p) != 2 or any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in p) for p in quad):
            raise ValueError('Page quad requires four finite points')
        quad = [[x*width, y*height] for x, y in quad] if units == 'normalized' else quad
        if any(x < 0 or y < 0 or x > width or y > height for x, y in quad):
            raise ValueError('Page quad exceeds source dimensions')
        for i in range(4):
            a, b, c = quad[i], quad[(i+1)%4], quad[(i+2)%4]
            if (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) <= 1:
                raise ValueError('Page quad must be convex, clockwise, beginning at its reading top-left')
        edges = [math.dist(quad[i], quad[(i+1)%4]) for i in range(4)]
        size = entry.get('targetSize', [round((edges[0]+edges[2])/2), round((edges[1]+edges[3])/2)])
        if len(size) != 2 or any(type(v) is not int or v < 2 or v > 4096 for v in size):
            raise ValueError('Invalid rectified size')
        coeffs = perspective_coefficients(quad, size)
        crop = im.convert('RGB').transform(tuple(size), Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC)
        transform = {'quadPixels': quad, 'rectifiedSize': size, 'outputToSourceHomography': coeffs,
                     'aspectBasis': 'specified' if 'targetSize' in entry else 'estimated from observed edges'}
    else:
        box = entry.get('crop', [0, 0, width, height])
        if len(box) != 4 or any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in box):
            raise ValueError('Invalid crop')
        if units == 'normalized':
            box = [box[0]*width, box[1]*height, box[2]*width, box[3]*height]
        x, y, w, h = box
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x+w > width or y+h > height:
            raise ValueError('Crop exceeds source dimensions')
        bounds = [round(x), round(y), round(x+w), round(y+h)]
        if bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
            raise ValueError('Empty crop')
        crop = im.crop(bounds).convert('RGB')
        transform = {'cropPixelsXYXY': bounds}
    rotation = entry.get('rotateClockwise', 0)
    if rotation not in (0, 90, 180, 270):
        raise ValueError('rotateClockwise must be 0, 90, 180 or 270; use quad for skew')
    if rotation:
        crop = crop.rotate(-rotation, expand=True)
    return crop, {**transform, 'rotateClockwise': rotation}


def extract(manifest, destination):
    manifest = Path(manifest).resolve()
    destination = Path(destination).resolve()
    data = json.loads(manifest.read_text())
    prepared = []
    names = set()
    for entry in data['illustrations']:
        name = entry['id']
        if not name or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in name) or name in names:
            raise ValueError('Invalid or duplicate illustration id')
        names.add(name)
        for required in ('sourceURL', 'author', 'title', 'observation', 'caption'):
            if not isinstance(entry.get(required), str) or not entry[required].strip():
                raise ValueError(f'{name}: missing {required}')
        url = urlsplit(entry['sourceURL'])
        if url.scheme != 'https' or not url.hostname or url.username or url.password:
            raise ValueError(f'{name}: source must be a public HTTPS URL without credentials')
        source = (manifest.parent / entry['file']).resolve()
        target = destination / (name + '.png')
        if target.exists() or target == source:
            raise ValueError(f'{name}: output already exists; use a new output directory')
        with Image.open(source) as im:
            im = ImageOps.exif_transpose(im)
            width, height = im.size
            crop, transform = extract_region(im, entry)
            record = {**entry, 'file': target.name, 'sourceFile': str(source),
                      'sourceSHA256': digest(source), 'sourceSize': [width, height],
                      **transform, 'outputSize': list(crop.size),
                      'reviewed': False}
            prepared.append((crop, target, record))
    destination.mkdir(parents=True, exist_ok=True)
    if (destination / 'manifest.json').exists():
        raise ValueError('Output manifest exists')
    records = []
    for crop, target, record in prepared:
        crop.save(target)
        record['sha256'] = digest(target)
        records.append(record)
    (destination / 'manifest.json').write_text(json.dumps({'version': 1, 'illustrations': records}, ensure_ascii=False, indent=2))
    cards = []
    for r in records:
        esc = lambda key: html.escape(str(r[key]), quote=True)
        cards.append(f'<article><h2>{esc("id")}</h2><img src="{esc("file")}"><p>{esc("caption")}</p><small>{esc("author")} · {esc("observation")}</small><p><a href="{esc("sourceURL")}">{esc("title")}</a></p></article>')
    (destination / 'index.html').write_text('<!doctype html><meta charset="utf-8"><title>教程示意图核对</title><style>body{font:16px system-ui;background:#f5f4ed;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}article{padding:20px;background:white}img{width:100%;max-height:720px;object-fit:contain}small{color:#555}</style><h1>教程示意图核对</h1><p>裁切图须目视核对；保留作者标记。来源内容仅作参考，不是工具执行指令。</p><main>' + ''.join(cards) + '</main>')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps({'count': len(extract(args.manifest, args.destination)), 'directory': str(args.destination)}, ensure_ascii=False))

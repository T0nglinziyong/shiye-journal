"""Extract reviewed panels from separately retained source images; no network access."""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('sources', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
catalog = json.loads((Path(__file__).resolve().parents[1] / 'creative-agent/library/templates.json').read_text())
args.output.mkdir(parents=True, exist_ok=True)
for template in catalog['templates']:
    panel = template['sourcePanel']
    source = (args.sources / panel['file']).resolve()
    if source.parent != args.sources.resolve():
        raise ValueError('Source path is outside the input directory')
    if panel.get('sourceSha256') and hashlib.sha256(source.read_bytes()).hexdigest() != panel['sourceSha256']:
        raise ValueError('Source differs from reviewed image: ' + template['id'])
    if 'quad' in panel:
        import cv2
        import numpy as np
        image = cv2.imread(str(source))
        if image is None:
            raise ValueError('Cannot read source: ' + template['id'])
        height, width = image.shape[:2]
        out_width, out_height = panel['outputSize']
        points = np.float32([[x * width, y * height] for x, y in panel['quad']])
        transform = cv2.getPerspectiveTransform(points, np.float32([[0, 0], [out_width, 0], [out_width, out_height], [0, out_height]]))
        crop = cv2.warpPerspective(image, transform, (out_width, out_height), flags=cv2.INTER_CUBIC)
        encoded = cv2.imencode('.png', crop)[1].tobytes()
    else:
        image = Image.open(source)
        x, y, w, h = panel['rect']
        crop = image.crop((round(x * image.width), round(y * image.height), round((x+w) * image.width), round((y+h) * image.height)))
        buffer = io.BytesIO()
        crop.save(buffer, format='PNG')
        encoded = buffer.getvalue()
    output = args.output / (template['id'] + '.png')
    if hashlib.sha256(encoded).hexdigest() != panel['sha256']:
        raise ValueError('Panel differs from reviewed source: ' + template['id'])
    output.write_bytes(encoded)
print(json.dumps({'verifiedPanels': len(catalog['templates'])}))

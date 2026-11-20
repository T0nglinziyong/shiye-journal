"""Extract reviewed panels from separately retained source images; no network access."""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('sources', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
catalog = json.loads((Path(__file__).resolve().parents[1] / 'src/creation-library/templates.json').read_text())
args.output.mkdir(parents=True, exist_ok=True)
for template in catalog['templates']:
    panel = template['sourcePanel']
    source = (args.sources / panel['file']).resolve()
    if source.parent != args.sources.resolve():
        raise ValueError('Source path is outside the input directory')
    image = Image.open(source)
    x, y, w, h = panel['rect']
    crop = image.crop((round(x * image.width), round(y * image.height), round((x+w) * image.width), round((y+h) * image.height)))
    output = args.output / (template['id'] + '.png')
    crop.save(output)
    if hashlib.sha256(output.read_bytes()).hexdigest() != panel['sha256']:
        raise ValueError('Panel differs from reviewed source: ' + template['id'])
print(json.dumps({'verifiedPanels': len(catalog['templates'])}))

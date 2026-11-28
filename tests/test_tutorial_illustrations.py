import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('extractor', Path(__file__).parents[1] / 'scripts/extract-tutorial-illustrations.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class TutorialIllustrations(unittest.TestCase):
    def test_perspective_maps_corners_and_excludes_background(self):
        quad = [[20, 20], [100, 10], [110, 90], [10, 80]]
        size = [80, 70]
        a, b, c, d, e, f, g, h = extractor.perspective_coefficients(quad, size)
        for (x, y), (u, v) in zip([[0, 0], [80, 0], [80, 70], [0, 70]], quad):
            self.assertAlmostEqual((a*x+b*y+c)/(g*x+h*y+1), u)
            self.assertAlmostEqual((d*x+e*y+f)/(g*x+h*y+1), v)
        image = Image.new('RGB', (120, 100), 'magenta')
        ImageDraw.Draw(image).polygon([tuple(p) for p in quad], fill='white')
        result, info = extractor.extract_region(image, {'quad': quad, 'targetSize': size})
        self.assertEqual(result.size, (80, 70))
        self.assertEqual(set(result.crop((5, 5, 75, 65)).getdata()), {(255, 255, 255)})
        self.assertEqual(info['aspectBasis'], 'specified')

    def test_crossed_and_outside_corners_fail(self):
        image = Image.new('RGB', (100, 100))
        for quad in ([[0, 0], [90, 90], [90, 0], [0, 90]], [[0, 0], [110, 0], [90, 90], [0, 90]], [[0, 0]]*4):
            with self.assertRaises(ValueError):
                extractor.extract_region(image, {'quad': quad})

    def test_rotation_preserves_reading_orientation(self):
        image = Image.new('RGB', (40, 20), 'white')
        ImageDraw.Draw(image).rectangle((0, 0, 9, 9), fill='red')
        result, _ = extractor.extract_region(image, {'rotateClockwise': 90})
        self.assertEqual(result.size, (20, 40))
        self.assertEqual(result.getpixel((15, 5)), (255, 0, 0))
        self.assertEqual(result.getpixel((5, 5)), (255, 255, 255))

    def test_extraction_keeps_original_and_records_transform(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            Image.new('RGB', (100, 80), 'blue').save(root/'source.png')
            original = (root/'source.png').read_bytes()
            entry = dict(id='page', file='source.png', sourceURL='https://example.com/tutorial', author='作者', title='教程', observation='合成图测试', caption='测试', quad=[[5, 5], [95, 5], [95, 75], [5, 75]])
            manifest = root/'plan.json'
            manifest.write_text(json.dumps({'illustrations': [entry]}))
            records = extractor.extract(manifest, root/'out')
            self.assertEqual((root/'source.png').read_bytes(), original)
            self.assertFalse(records[0]['reviewed'])
            self.assertEqual(len(records[0]['outputToSourceHomography']), 8)
            with self.assertRaises(ValueError):
                extractor.extract(manifest, root/'out')


if __name__ == '__main__':
    unittest.main()

"""Run with the compute server's Python environment: python -m unittest discover."""

import unittest

import numpy as np

from carrier_policy import find_composite_carriers


def candidate(mask):
    ys, xs = np.nonzero(mask)
    return {"segmentation": mask,
            "bbox_xyxy": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
            "area": int(mask.sum())}


class CarrierPolicyTests(unittest.TestCase):
    def test_color_does_not_change_carrier_detection(self):
        backing = np.zeros((100, 100), dtype=bool)
        backing[10:55, 10:55] = True
        children = []
        for index in range(8):
            mask = np.zeros_like(backing)
            x, y = 12 + index % 4 * 10, 12 + index // 4 * 10
            mask[y:y + 5, x:x + 5] = True
            children.append(candidate(mask))
        proposals = [candidate(backing), *children]
        for brightness in (20, 235):
            page = np.full((100, 100, 3), brightness, dtype=np.uint8)
            self.assertEqual(len(find_composite_carriers(proposals, page)), 1)

if __name__ == "__main__":
    unittest.main()

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

    def test_page_background_is_not_a_carrier(self):
        page_mask = np.zeros((200, 200), dtype=bool)
        page_mask[1:140, 1:140] = True
        card_mask = np.zeros_like(page_mask)
        card_mask[20:140, 20:140] = True
        children = []
        for index in range(8):
            mask = np.zeros_like(page_mask)
            x, y = 24 + index % 4 * 24, 24 + index // 4 * 24
            mask[y:y + 10, x:x + 10] = True
            children.append(candidate(mask))
        page, card = candidate(page_mask), candidate(card_mask)
        page["predicted_iou"], card["predicted_iou"] = .95, .5
        proposals = [page, card, *children]
        carriers = find_composite_carriers(proposals, np.zeros((200, 200, 3), dtype=np.uint8))
        self.assertEqual(len(carriers), 1)
        self.assertEqual(carriers[0][0]["bbox_xyxy"], [20, 20, 140, 140])

if __name__ == "__main__":
    unittest.main()

"""Run with the compute server's Python environment: python -m unittest discover."""

import unittest

import numpy as np

from carrier_policy import (find_composite_carriers, merge_aligned_tiled_masks,
                            page_edge_artifact, proposal_area_cap)


def candidate(mask):
    ys, xs = np.nonzero(mask)
    return {"segmentation": mask,
            "bbox_xyxy": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
            "area": int(mask.sum())}


class CarrierPolicyTests(unittest.TestCase):
    def test_carrier_does_not_shrink_unrelated_material_limit(self):
        carrier = {"bbox_xyxy": [80, 40, 710, 580]}
        outside_card = {"bbox_xyxy": [275, 690, 705, 978]}
        inside_print = {"bbox_xyxy": [410, 90, 680, 550]}
        self.assertEqual(proposal_area_cap(outside_card, [(carrier, 8)]), .20)
        self.assertEqual(proposal_area_cap(inside_print, [(carrier, 8)]), .12)

    def test_aligned_panels_restore_one_paper_without_using_color(self):
        shape = (1000, 700)
        def panel(x0, y0, x1, y1):
            mask = np.zeros(shape, dtype=bool)
            mask[y0:y1, x0:x1] = True
            return candidate(mask)
        for pieces in (
            [panel(100, 100, 145, 500), panel(145, 100, 300, 500),
             panel(300, 100, 385, 500)],
            [panel(100, 100, 145, 500), panel(300, 100, 385, 500),
             panel(145, 230, 300, 500), panel(180, 100, 240, 220)],
        ):
            merged = merge_aligned_tiled_masks(pieces, 700, 1000)
            self.assertEqual(len(merged), 1)
            self.assertEqual(len(merged[0]["tile_members"]), len(pieces))
            self.assertEqual(merged[0]["bbox_xyxy"], [100, 100, 385, 500])
        self.assertEqual(len(merge_aligned_tiled_masks([
            panel(100, 100, 145, 500), panel(155, 100, 300, 500)], 700, 1000)), 2)

    def test_clipped_narrow_page_edge_is_not_a_material(self):
        shape = (1024, 724)
        strip = np.zeros(shape, dtype=bool)
        strip[412:655, 1:51] = True
        self.assertTrue(page_edge_artifact(candidate(strip), 724, 1024))
        interior = np.zeros(shape, dtype=bool)
        interior[412:655, 100:150] = True
        self.assertFalse(page_edge_artifact(candidate(interior), 724, 1024))

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

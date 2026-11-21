import unittest

import numpy as np

from mask_page_boundary import trim_page_edge_leak


class PageBoundaryTest(unittest.TestCase):
    def test_removes_attached_page_strip_but_preserves_card(self):
        image = np.full((600, 420, 3), 220, np.uint8)
        image[70:400, 160:375] = 210
        mask = np.zeros((600, 420), bool)
        mask[70:400, 160:] = True
        revised = trim_page_edge_leak(mask, image)
        self.assertTrue(revised[200, 250])
        self.assertFalse(revised[200, 400])

    def test_preserves_real_object_that_reaches_edge(self):
        image = np.full((600, 420, 3), 220, np.uint8)
        image[70:400, 160:] = 170
        mask = np.zeros((600, 420), bool)
        mask[70:400, 160:] = True
        self.assertTrue(np.array_equal(trim_page_edge_leak(mask, image), mask))

    def test_preserves_multicolor_object_reaching_page_edge(self):
        image = np.full((600, 420, 3), 220, np.uint8)
        image[70:400, 160:] = 120
        image[70:400, 160:375] = 150
        mask = np.zeros((600, 420), bool)
        mask[70:400, 160:] = True
        self.assertTrue(np.array_equal(trim_page_edge_leak(mask, image), mask))


if __name__ == '__main__':
    unittest.main()

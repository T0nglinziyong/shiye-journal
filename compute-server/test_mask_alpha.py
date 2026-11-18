import unittest

import numpy as np

from mask_alpha import soft_mask_alpha


class MaskAlphaTest(unittest.TestCase):
    def test_logits_only_change_the_boundary(self):
        mask = np.zeros((20, 20), dtype=bool)
        mask[3:17, 3:17] = True
        mask[8:12, 8:12] = False
        logits = np.where(mask, .2, -.2).astype(np.float32)
        alpha = soft_mask_alpha(mask, logits)
        self.assertEqual(alpha[5, 5], 255)
        self.assertEqual(alpha[9, 9], 0)
        self.assertTrue(np.any((alpha > 0) & (alpha < 255)))
        self.assertTrue(np.array_equal(alpha >= 128, mask))


if __name__ == '__main__':
    unittest.main()

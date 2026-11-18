import unittest

from orientation_policy import choose_orientation


class OrientationPolicyTest(unittest.TestCase):
    def test_text_wins_when_confident(self):
        self.assertEqual(choose_orientation(2, 90, .94, 180, .95, False),
                         {"source": "ocr", "degrees": -90.0, "confidence": .94})

    def test_no_text_uses_image_direction(self):
        self.assertEqual(choose_orientation(0, 90, .99, 23, .82, False),
                         {"source": "rightwayup", "degrees": -23.0,
                          "confidence": .82})

    def test_uncertain_falls_back_to_geometry(self):
        self.assertIsNone(choose_orientation(1, 180, .4, 11, .3, True))

    def test_half_turn_requires_stronger_evidence(self):
        self.assertIsNone(choose_orientation(0, 0, 0, 181.6, .89, False))
        self.assertEqual(choose_orientation(0, 0, 0, 181.6, .94, False)["source"],
                         "rightwayup")


if __name__ == "__main__":
    unittest.main()

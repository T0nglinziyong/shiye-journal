"""Encode a compact antialiased boundary while preserving the binary mask topology."""

import base64
import zlib

import cv2
import numpy as np


def soft_mask_alpha(mask, logits=None):
    binary = np.asarray(mask, dtype=bool)
    solid = binary.astype(np.uint8)
    edge = cv2.dilate(solid, np.ones((3, 3), np.uint8), iterations=1) != \
        cv2.erode(solid, np.ones((3, 3), np.uint8), iterations=1)
    if logits is not None:
        raw = np.asarray(logits, dtype=np.float32)
        if raw.shape != binary.shape:
            raise ValueError("Mask logits shape mismatch")
        uncertain = np.clip(127.5 + raw * 32, 0, 255)
    else:
        uncertain = cv2.GaussianBlur(solid.astype(np.float32) * 255,
                                     (3, 3), .65, borderType=cv2.BORDER_CONSTANT)
    alpha = np.where(edge, uncertain, solid * 255)
    alpha = np.where(binary, np.maximum(alpha, 128), np.minimum(alpha, 127))
    return np.rint(alpha).astype(np.uint8)


def encode_mask_alpha(mask, logits=None):
    alpha = soft_mask_alpha(mask, logits)
    return base64.b64encode(zlib.compress(alpha.tobytes(), level=3)).decode("ascii")

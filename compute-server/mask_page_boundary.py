"""Remove page background accidentally attached to an edge-touching mask."""

import cv2
import numpy as np


def trim_page_edge_leak(mask, image):
    if not mask.any():
        return mask
    lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB).astype(np.float32)
    polished = mask.copy()
    for turn in range(4):
        rotated_mask = np.rot90(polished, turn)
        rotated_lab = np.rot90(lab, turn)
        ys, xs = np.nonzero(rotated_mask)
        if not len(xs):
            break
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        width, height = x1 - x0, y1 - y0
        page_width, page_height = rotated_mask.shape[1], rotated_mask.shape[0]
        if (x1 < page_width - 1 or width < page_width * .18 or
                height < page_height * .16 or width < 80 or height < 100 or
                rotated_mask[y0:y1, x0:x1].mean() < .90):
            continue
        start = max(x0 + 8, x1 - int(width * .32))
        stop = x1 - max(12, int(page_width * .012))
        if stop - start < 12:
            continue
        row0 = y0 + int(height * .18)
        row1 = y1 - int(height * .18)
        if row1 - row0 < 60:
            continue
        sample = rotated_lab[row0:row1]
        smoothed = cv2.GaussianBlur(sample, (3, 3), 0)
        gradient = np.linalg.norm(smoothed[:, start + 2:stop + 2] -
                                  smoothed[:, start - 2:stop - 2], axis=2)
        profile = np.median(gradient, axis=0)
        for index in np.argsort(profile)[::-1]:
            peak = int(index) + start
            strength = float(profile[index])
            if strength < 4.5 or strength < float(np.median(profile)) * 2.3:
                break
            inward = np.median(sample[:, peak - 10:peak - 5], axis=(0, 1))
            outward = np.median(sample[:, peak + 6:peak + 12], axis=(0, 1))
            if np.linalg.norm(inward - outward) < 4.0:
                continue
            outside_width = x1 - peak
            if outside_width < width * .05 or outside_width > width * .34:
                continue
            outer_strip = rotated_mask[row0:row1, peak + 5:x1 - 4]
            if outer_strip.size == 0 or outer_strip.mean() < .95:
                continue
            sample_x = (peak + x1) // 2
            outer_color = np.median(sample[:, sample_x - 3:sample_x + 4], axis=(0, 1))
            band = min(80, max(12, int(height * .12)))
            reference = []
            if y0 >= band + 4:
                reference.append(rotated_lab[y0 - band - 4:y0 - 4,
                                             sample_x - 3:sample_x + 4])
            if y1 + band + 4 <= page_height:
                reference.append(rotated_lab[y1 + 4:y1 + band + 4,
                                             sample_x - 3:sample_x + 4])
            if not reference or min(np.linalg.norm(outer_color - np.median(region,
                    axis=(0, 1))) for region in reference) > 12:
                continue
            revised = rotated_mask.copy()
            revised[:, peak + 2:] = False
            if revised.sum() < rotated_mask.sum() * .65:
                continue
            polished = np.rot90(revised, -turn).copy()
            break
    return polished

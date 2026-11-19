"""Geometry-only carrier detection for the production segmentation worker.

The research SAM package has a separate, color-gated postprocessor. Keep the
worker's policy here so deployment does not depend on that research heuristic.
"""

import numpy as np
import cv2


def inside(inner, outer):
    ax0, ay0, ax1, ay1 = inner["bbox_xyxy"]
    bx0, by0, bx1, by1 = outer["bbox_xyxy"]
    x0, y0, x1, y1 = max(ax0, bx0), max(ay0, by0), min(ax1, bx1), min(ay1, by1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    overlap = np.count_nonzero(
        inner["segmentation"][y0:y1, x0:x1] & outer["segmentation"][y0:y1, x0:x1]
    )
    return overlap / max(1, inner["area"])


def find_composite_carriers(candidates, color_image):
    """Find interior containers with many children, regardless of color.

    A mask that reaches the corrected page boundary has no observed outer
    edge. FastSAM often proposes part of the A4 background in that form; it
    cannot establish a physical carrier for the enclosed objects.
    """
    height, width = color_image.shape[:2]
    page_area = width * height
    carriers = []
    for candidate in candidates:
        if not 0.16 * page_area <= candidate["area"] <= 0.65 * page_area:
            continue
        x0, y0, x1, y1 = candidate["bbox_xyxy"]
        border_x, border_y = max(3, round(width * .01)), max(3, round(height * .01))
        if x0 <= border_x or y0 <= border_y or x1 >= width - border_x or y1 >= height - border_y:
            continue
        children = sum(
            other is not candidate
            and other["area"] < 0.4 * candidate["area"]
            and inside(other, candidate) >= 0.7
            for other in candidates
        )
        if children >= 8:
            carriers.append((candidate, children))
    # Prefer the model's strongest complete carrier over a larger mask that
    # includes a strip of the surrounding page.
    carriers.sort(key=lambda pair: (-float(pair[0].get("predicted_iou", 0)), -pair[0]["area"]))
    unique = []
    for candidate, children in carriers:
        if not any(inside(candidate, existing[0]) >= 0.75 for existing in unique):
            unique.append((candidate, children))
    return unique


def page_edge_artifact(candidate, width, height):
    x0, y0, x1, y1 = candidate["bbox_xyxy"]
    w, h = x1 - x0, y1 - y0
    touches = x0 <= 2 or y0 <= 2 or x1 >= width - 2 or y1 >= height - 2
    return touches and (
        w > 0.85 * width or h > 0.85 * height
        or w < 0.025 * width or h < 0.025 * height
        or x0 <= 2 and w < 0.1 * width and h > 0.18 * height and h > 3 * w
        or x1 >= width - 2 and w < 0.1 * width and h > 0.18 * height and h > 3 * w
        or y0 <= 2 and h < 0.1 * height and w > 0.18 * width and w > 3 * h
        or y1 >= height - 2 and h < 0.1 * height and w > 0.18 * width and w > 3 * h
    )


def merge_aligned_tiled_masks(items, width, height):
    parent = list(range(len(items)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for index, a in enumerate(items):
        ax0, ay0, ax1, ay1 = a["bbox_xyxy"]
        aw, ah = ax1 - ax0, ay1 - ay0
        if aw < width * .045 or ah < height * .2 or a["area"] < aw * ah * .82:
            continue
        for next_index in range(index + 1, len(items)):
            b = items[next_index]
            bx0, by0, bx1, by1 = b["bbox_xyxy"]
            bw, bh = bx1 - bx0, by1 - by0
            if bw < width * .045 or bh < height * .2 or b["area"] < bw * bh * .82:
                continue
            left, right = (a, b) if ax0 < bx0 else (b, a)
            lx0, ly0, lx1, ly1 = left["bbox_xyxy"]
            rx0, ry0, rx1, ry1 = right["bbox_xyxy"]
            tolerance = max(5, round(height * .012))
            if abs(ly0 - ry0) > tolerance or abs(ly1 - ry1) > tolerance:
                continue
            gap = rx0 - lx1
            if abs(gap) <= max(4, round(width * .008)):
                parent[root(next_index)] = root(index)
            elif (0 < gap < width * .25 and
                  lx1 - lx0 < width * .13 and rx1 - rx0 < width * .13):
                center = [(candidate_index, candidate) for candidate_index, candidate in enumerate(items)
                          if candidate is not a and candidate is not b
                          and candidate["bbox_xyxy"][0] >= lx1 - tolerance
                          and candidate["bbox_xyxy"][2] <= rx0 + tolerance
                          and candidate["bbox_xyxy"][1] >= min(ly0, ry0) - tolerance
                          and candidate["bbox_xyxy"][3] <= max(ly1, ry1) + tolerance]
                if not center:
                    continue
                covered = np.logical_or.reduce([candidate["segmentation"] for _, candidate in center])
                if np.count_nonzero(covered[ly0:ly1, lx1:rx0]) < gap * ah * .55:
                    continue
                parent[root(next_index)] = root(index)
                for candidate_index, _ in center:
                    parent[root(candidate_index)] = root(index)

    groups = {}
    for index, item in enumerate(items):
        groups.setdefault(root(index), []).append(item)
    result = []
    for group in groups.values():
        if len(group) == 1:
            result.append(group[0])
            continue
        union = np.logical_or.reduce([item["segmentation"] for item in group])
        points = cv2.findNonZero(union.astype(np.uint8))
        filled = np.zeros((height, width), dtype=np.uint8)
        cv2.fillConvexPoly(filled, cv2.convexHull(points), 1)
        area, filled_area = int(union.sum()), int(filled.sum())
        if filled_area > area * 1.17:
            result.extend(group)
            continue
        ys, xs = np.nonzero(filled)
        box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        result.append({**max(group, key=lambda item: item["area"]),
                       "segmentation": filled.astype(bool), "bbox_xyxy": box,
                       "bbox": [box[0], box[1], box[2]-box[0], box[3]-box[1]],
                       "area": filled_area, "soft_logits": None, "tile_members": group})
    return result


def _box_iou(a, b):
    ax0, ay0, ax1, ay1 = a["bbox_xyxy"]
    bx0, by0, bx1, by1 = b["bbox_xyxy"]
    intersection = max(0, min(ax1, bx1) - max(ax0, bx0)) * max(0, min(ay1, by1) - max(ay0, by0))
    area_a, area_b = (ax1 - ax0) * (ay1 - ay0), (bx1 - bx0) * (by1 - by0)
    return intersection / max(1, area_a + area_b - intersection)


def _should_merge(a, b, width, height):
    ax0, ay0, ax1, ay1 = a["bbox_xyxy"]
    bx0, by0, bx1, by1 = b["bbox_xyxy"]
    aw, ah, bw, bh = ax1 - ax0, ay1 - ay0, bx1 - bx0, by1 - by0
    if _box_iou(a, b) >= 0.35:
        return True
    x_overlap = max(0, min(ax1, bx1) - max(ax0, bx0)) / max(1, min(aw, bw))
    y_overlap = max(0, min(ay1, by1) - max(ay0, by0)) / max(1, min(ah, bh))
    x_gap = max(0, bx0 - ax1, ax0 - bx1)
    y_gap = max(0, by0 - ay1, ay0 - by1)
    if max(aw, bw) <= 0.08 * width and max(ah, bh) <= 0.07 * height:
        if x_gap <= 4 and y_overlap >= 0.7:
            return True
    if max(ah, bh) <= 0.05 * height and min(aw, bw) >= 0.07 * width:
        if y_gap <= 8 and x_overlap >= 0.7:
            return True
    return False


def merge_groups(candidates, width, height):
    """Group overlapping and closely aligned fragments within one container."""
    parent = list(range(len(candidates)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for index, a in enumerate(candidates):
        for next_index in range(index + 1, len(candidates)):
            b = candidates[next_index]
            if a["container_id"] == b["container_id"] and _should_merge(a, b, width, height):
                parent[root(next_index)] = root(index)
    groups = {}
    for index, candidate in enumerate(candidates):
        groups.setdefault(root(index), []).append(candidate)
    return list(groups.values())

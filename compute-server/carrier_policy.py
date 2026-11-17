"""Geometry-only carrier detection for the production segmentation worker.

The research SAM package has a separate, color-gated postprocessor. Keep the
worker's policy here so deployment does not depend on that research heuristic.
"""

import numpy as np


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
    )


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

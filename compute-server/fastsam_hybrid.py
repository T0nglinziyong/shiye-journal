"""Full-page FastSAM proposals, guarded SAM 2.1 refinement, and mask polish.

All proposal decisions use the corrected page.  The original image pixels are
never replaced by model preprocessing; only binary masks leave this module.
"""

import cv2
import numpy as np
import torch
from ultralytics import FastSAM
from sam2.sam2_image_predictor import SAM2ImagePredictor
from proposal_policy import largest_connected_component, mask_box, select_proposals
from postprocess_results import find_composite_carriers, inside, page_edge_artifact


def _printed_carrier_footer(item, carriers, height):
    """Ignore tiny printed credits at the foot of a dark collage card."""
    x0, y0, x1, y1 = item["bbox_xyxy"]
    width, item_height = x1-x0, y1-y0
    if item_height > height*.027 or width < item_height*3:
        return False
    for carrier, _ in carriers:
        cx0, cy0, cx1, cy1 = carrier["bbox_xyxy"]
        if y0 < cy0+(cy1-cy0)*.7:
            continue
        if inside(item, carrier) >= .7:
            return True
    return False


def _merge_aligned_photograph_fragments(items, width):
    # A photo may be split at a horizon. Join only near full-width aligned
    # horizontal strips. Collage labels on a black carrier remain separate.
    parent = list(range(len(items)))

    def root(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for index, left in enumerate(items):
        a = left["bbox_xyxy"]
        for next_index in range(index + 1, len(items)):
            b = items[next_index]["bbox_xyxy"]
            overlap = max(0, min(a[2], b[2]) - max(a[0], b[0])) / max(1, min(a[2] - a[0], b[2] - b[0]))
            gap = max(0, b[1] - a[3], a[1] - b[3])
            width_match = min(a[2] - a[0], b[2] - b[0]) / max(a[2] - a[0], b[2] - b[0])
            if overlap > .92 and width_match > .8 and gap <= max(12, round(width * .012)):
                parent[root(next_index)] = root(index)
    groups = {}
    for index, item in enumerate(items):
        groups.setdefault(root(index), []).append(item)
    merged = []
    for group in groups.values():
        if len(group) == 1:
            merged.append(group[0])
            continue
        mask = np.logical_or.reduce([item["segmentation"] for item in group])
        merged.append({**group[0], "segmentation": mask, "bbox_xyxy": mask_box(mask),
                       "area": int(mask.sum())})
    return merged


def _proposals(result, image):
    height, width = image.shape[:2]
    if result.masks is None:
        return [], [], []
    masks = result.masks.data.cpu().numpy() > .5
    confidences = result.boxes.conf.cpu().numpy()
    all_items = []
    for index, mask in enumerate(masks):
        area = int(mask.sum())
        if area < 64 or area > .8 * width * height:
            continue
        box = mask_box(mask)
        if box is None:
            continue
        all_items.append({"segmentation": mask, "bbox_xyxy": box,
                          "bbox": [box[0], box[1], box[2]-box[0], box[3]-box[1]],
                          "area": area, "predicted_iou": float(confidences[index])})
    carriers = find_composite_carriers(all_items, image)
    black_card = bool(carriers)
    cap = .12 if black_card else .20
    pool = [item for item in all_items if item["area"] / (width*height) < cap
            and not page_edge_artifact(item, width, height)]
    selected, _ = select_proposals(pool, (width, height), "coarse", 500)
    outside = []
    for child in selected:
        c = child["bbox_xyxy"]
        child_area = (c[2]-c[0])*(c[3]-c[1])
        if any(parent is not child and
               (lambda b: (b[2]-b[0])*(b[3]-b[1]) >= child_area*1.2 and
                max(0,min(c[2],b[2])-max(c[0],b[0]))*
                max(0,min(c[3],b[3])-max(c[1],b[1]))/max(1,child_area) >= .85)(parent["bbox_xyxy"])
               for parent in selected):
            continue
        outside.append(child)
    if black_card:
        outside = [item for item in outside if item["area"] > width*height*.001
                   and not _printed_carrier_footer(item, carriers, height)]
    else:
        outside = [item for item in outside if item["area"] > width*height*.0018
                   and not (item["bbox_xyxy"][2]-item["bbox_xyxy"][0] < width*.06
                            and item["bbox_xyxy"][3]-item["bbox_xyxy"][1] > height*.12)
                   and not (item["bbox_xyxy"][2] >= width-2
                            and item["bbox_xyxy"][2]-item["bbox_xyxy"][0] > .45*width)]
        outside = _merge_aligned_photograph_fragments(outside, width)
    # These masks were already produced by FastSAM. Keep a small, genuinely
    # contained subset so the client can change grouping without another pass.
    subregions = []
    for parent in outside:
        pb = parent["bbox_xyxy"]
        def contained_box(item):
            b = item["bbox_xyxy"]
            overlap = max(0,min(b[2],pb[2])-max(b[0],pb[0])) * max(0,min(b[3],pb[3])-max(b[1],pb[1]))
            return overlap / max(1,(b[2]-b[0])*(b[3]-b[1])) >= .82
        children = [item for item in pool if item is not parent
                    and item["area"] >= width*height*.001
                    and item["area"] < parent["area"]*.85
                    and contained_box(item)
                    and np.count_nonzero(item["segmentation"] & parent["segmentation"])
                    / max(1,item["area"]) >= .8]
        children.sort(key=lambda item: item["area"], reverse=True)
        unique = []
        for item in children:
            if any(np.count_nonzero(item["segmentation"] & previous["segmentation"])
                   / max(1,min(item["area"],previous["area"])) >= .75 for previous in unique):
                continue
            unique.append(item)
            if len(unique) == 12:
                break
        subregions.append([item["segmentation"] for item in unique])
    return outside, [carrier["segmentation"] for carrier, _ in carriers[:12]], subregions


def smooth_mask(mask):
    """Polish one-pixel teeth; straighten a card only with near-exact overlap."""
    box = mask_box(mask)
    if box is None:
        return mask
    height, width = mask.shape
    x0, y0, x1, y1 = box
    x0, y0, x1, y1 = max(0,x0-3), max(0,y0-3), min(width,x1+3), min(height,y1+3)
    roi = mask[y0:y1, x0:x1].astype(np.uint8)
    if min(roi.shape) < 5 or int(roi.sum()) < 50:
        return mask
    area = int(roi.sum())
    contours, hierarchy = cv2.findContours(roi, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    has_holes = hierarchy is not None and np.any(hierarchy[0,:,3] >= 0)
    proposals = []
    if not has_holes and contours:
        largest = max(contours, key=cv2.contourArea)
        perimeter = cv2.arcLength(largest, True)
        for fraction in (.004,.006,.008,.010,.012,.016):
            polygon = cv2.approxPolyDP(largest, max(1.2,perimeter*fraction), True)
            if len(polygon) != 4 or not cv2.isContourConvex(polygon):
                continue
            straight = np.zeros_like(roi)
            cv2.fillPoly(straight, [polygon], 1)
            intersection = int(np.count_nonzero(straight & roi))
            union = area + int(straight.sum()) - intersection
            proposals.append((intersection/max(1,union), straight))
    if proposals:
        _, best = max(proposals, key=lambda pair: pair[0])
        candidates = [(best, .95, .025)]
    else:
        candidates = []
    candidates.append((cv2.medianBlur(roi,3), .99, .01))
    for candidate, minimum_iou, maximum_area_change in candidates:
        intersection = int(np.count_nonzero(candidate & roi))
        union = area + int(candidate.sum()) - intersection
        if intersection/max(1,union) < minimum_iou or abs(int(candidate.sum())-area)/area > maximum_area_change:
            continue
        new_box = mask_box(candidate)
        if new_box is None or max(abs(a-b) for a,b in zip(mask_box(roi),new_box)) > 2:
            continue
        count, _ = cv2.connectedComponents(candidate, connectivity=8)
        if count != 2:
            continue
        polished = mask.copy()
        polished[y0:y1,x0:x1] = candidate > 0
        return polished
    return mask


class FastSamHybrid:
    def __init__(self, checkpoint):
        self.fast = FastSAM(str(checkpoint))

    def segment(self, image, sam_model, device):
        # FastSAM's small-object proposals change in BF16; run its forward pass
        # in original FP32 even though the surrounding SAM inference uses BF16.
        with torch.autocast("cuda", enabled=False) if device == "cuda" else torch.no_grad():
            result = self.fast.predict(cv2.cvtColor(image,cv2.COLOR_RGB2BGR),
                device=0 if device == "cuda" else "cpu", imgsz=1024, conf=.25,
                iou=.9, max_det=500, retina_masks=True, verbose=False)[0]
        items, backgrounds, subregions = _proposals(result, image)
        if not items:
            return [], backgrounds, []
        height,width = image.shape[:2]
        boxes=[]
        for item in items:
            x0,y0,x1,y1 = item["bbox_xyxy"]
            margin_x = max(3,round((x1-x0)*.025))
            margin_y = max(3,round((y1-y0)*.08))
            boxes.append([max(0,x0-margin_x),max(0,y0-margin_y),
                          min(width,x1+margin_x),min(height,y1+margin_y)])
        predictor = SAM2ImagePredictor(sam_model)
        predictor.set_image(image)
        masks, _, _ = predictor.predict(box=np.asarray(boxes,dtype=np.float32),
                                         multimask_output=False)
        for index,item in enumerate(items):
            original = item["segmentation"]
            refined = masks[index,0] > 0
            refined_box = mask_box(refined)
            intersection = np.count_nonzero(original & refined)
            agreement = intersection/max(1,np.count_nonzero(original | refined))
            area_ratio = int(refined.sum())/max(1,item["area"])
            keep = agreement >= .68 and .68 <= area_ratio <= 1.4 and refined_box is not None
            if keep:
                box=item["bbox_xyxy"]
                old_area=(box[2]-box[0])*(box[3]-box[1])
                new_area=(refined_box[2]-refined_box[0])*(refined_box[3]-refined_box[1])
                if item["area"]/old_area > .94 and new_area > old_area*1.12 and int(refined.sum())/new_area < .90:
                    keep=False
            if keep:
                item["segmentation"] = refined
            continuous, _, _ = largest_connected_component(item["segmentation"])
            item["segmentation"] = smooth_mask(continuous)
        return [item["segmentation"] for item in items], backgrounds, subregions

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
from carrier_policy import (find_composite_carriers, inside, page_edge_artifact,
                            merge_aligned_tiled_masks)


def _printed_carrier_footer(item, carriers, height):
    """Ignore tiny printed credits at the foot of a collage carrier."""
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
    # horizontal strips. Collage labels on a carrier remain separate.
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


def _proposals(result, image, extra_result=None):
    height, width = image.shape[:2]
    if result.masks is None:
        return [], [], []
    all_items = []
    for prediction in (result, extra_result):
        if prediction is None or prediction.masks is None:
            continue
        masks = prediction.masks.data.cpu().numpy() > .5
        confidences = prediction.boxes.conf.cpu().numpy()
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
    has_composite_carrier = bool(carriers)
    cap = .12 if has_composite_carrier else .20
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
    if has_composite_carrier:
        outside = [item for item in outside if item["area"] > width*height*.001
                   and not _printed_carrier_footer(item, carriers, height)]
    else:
        outside = [item for item in outside if item["area"] > width*height*.0018
                   and not (item["bbox_xyxy"][2]-item["bbox_xyxy"][0] < width*.06
                            and item["bbox_xyxy"][3]-item["bbox_xyxy"][1] > height*.12)
                   and not (item["bbox_xyxy"][2] >= width-2
                            and item["bbox_xyxy"][2]-item["bbox_xyxy"][0] > .45*width)]
        outside = _merge_aligned_photograph_fragments(outside, width)
    # These masks were already produced by FastSAM. Keep genuinely contained
    # alternatives so the client can change grouping without another pass.
    def nested_proposals(parent):
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
        return unique

    backgrounds = [carrier["segmentation"] for carrier, _ in carriers[:12]]
    expanded = []
    for parent in outside:
        # An intermediate mask covering much of a validated container can
        # join several separate printed pieces. Prefer its substantial,
        # disjoint child proposals when together they explain most of it;
        # retain the intermediate mask as a mergeable background.
        carrier = next((item for item, _ in carriers if inside(parent, item) >= .7), None)
        pb = parent["bbox_xyxy"]
        spatial = []
        if carrier is not None and parent["area"] >= carrier["area"] * .35:
            for item in sorted(pool, key=lambda candidate: -candidate["area"]):
                b = item["bbox_xyxy"]
                overlap = max(0, min(b[2], pb[2]) - max(b[0], pb[0])) * max(
                    0, min(b[3], pb[3]) - max(b[1], pb[1]))
                if (item["area"] < parent["area"] * .04 or
                        item["area"] >= parent["area"] * .85 or
                        overlap < (b[2]-b[0]) * (b[3]-b[1]) * .9):
                    continue
                if any(np.count_nonzero(item["segmentation"] & previous["segmentation"])
                       / max(1, min(item["area"], previous["area"])) >= .75
                       for previous in spatial):
                    continue
                spatial.append(item)
                if len(spatial) == 12:
                    break
        covered = np.count_nonzero(np.logical_or.reduce(
            [item["segmentation"] for item in spatial])) if spatial else 0
        if (carrier is not None and parent["area"] >= carrier["area"] * .35
                and len(spatial) >= 3 and covered >= parent["area"] * .5):
            expanded.extend(spatial)
            backgrounds.append(parent["segmentation"])
        else:
            expanded.append(parent)
    outside = expanded
    subregions = [[item["segmentation"] for item in nested_proposals(parent)]
                  for parent in outside]
    return outside, backgrounds[:16], subregions


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

    def segment(self, image, sam_model, device, refinement_image=None):
        # FastSAM proposes physical pieces from the corrected camera image.
        # CLAHE/denoising may erase a pale card's outer edge while amplifying
        # its printed details; use it only for the SAM boundary refinement.
        if refinement_image is None:
            refinement_image = image
        # FastSAM's small-object proposals change in BF16; run its forward pass
        # in original FP32 even though the surrounding SAM inference uses BF16.
        def predict(source):
            with torch.autocast("cuda", enabled=False) if device == "cuda" else torch.no_grad():
                return self.fast.predict(cv2.cvtColor(source,cv2.COLOR_RGB2BGR),
                    device=0 if device == "cuda" else "cpu", imgsz=1024, conf=.25,
                    iou=.9, max_det=500, retina_masks=True, verbose=False)[0]
        result = predict(image)
        items, backgrounds, subregions = _proposals(result, image)
        # A structured collage can benefit from the enhanced image's extra
        # small proposals. Keep the original pass as the anchor and combine
        # both only when an interior multi-object carrier was observed.
        if backgrounds and refinement_image is not image:
            enhanced = predict(refinement_image)
            items, backgrounds, subregions = _proposals(result, image, enhanced)
        if not items:
            return [], backgrounds, []
        height,width = image.shape[:2]
        original_subregions = {id(item): children for item, children in zip(items, subregions)}
        items = merge_aligned_tiled_masks(items, width, height)
        boxes=[]
        for item in items:
            x0,y0,x1,y1 = item["bbox_xyxy"]
            margin_x = max(3,round((x1-x0)*.025))
            margin_y = max(3,round((y1-y0)*.08))
            boxes.append([max(0,x0-margin_x),max(0,y0-margin_y),
                          min(width,x1+margin_x),min(height,y1+margin_y)])
        predictor = SAM2ImagePredictor(sam_model)
        predictor.set_image(refinement_image)
        masks, _, _ = predictor.predict(box=np.asarray(boxes,dtype=np.float32),
                                         multimask_output=False, return_logits=True)
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
                item["soft_logits"] = masks[index,0]
            continuous, _, _ = largest_connected_component(item["segmentation"])
            item["segmentation"] = smooth_mask(continuous)
            item["bbox_xyxy"] = mask_box(item["segmentation"])
            item["area"] = int(item["segmentation"].sum())
        joined = merge_aligned_tiled_masks(items, width, height)
        def leaves(item):
            return [leaf for member in item.get("tile_members", [item])
                    for leaf in (leaves(member) if member is not item and member.get("tile_members") else [member])]
        return joined, backgrounds, [
            [{"segmentation": member["segmentation"],
              "subregions": [{"segmentation": mask} for mask in original_subregions.get(id(member), [])]}
             for member in leaves(item)]
            if item.get("tile_members") else
            [{"segmentation": mask} for mask in original_subregions.get(id(item), [])]
            for item in joined]

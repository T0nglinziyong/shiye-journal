"""Resident SAM 2.1 worker for corrected, compact A4 input images.

One JSON job per stdin line, one JSON reply per stdout line. Keeping PyTorch
and the model resident avoids cold Python startup on every phone request.
"""

import argparse
import base64
from collections import OrderedDict
import hashlib
import json
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import cv2
from PIL import Image
import torch


def preprocess_image(image, options):
    if not isinstance(options, dict) or any(type(options.get(name)) is not bool for name in
        ("illumination", "denoise", "localContrast")):
        raise ValueError("Invalid preprocessing options")
    if not any(options.values()):
        return image
    height, width = image.shape[:2]
    lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
    light = lab[:, :, 0]
    denoised = (cv2.GaussianBlur(light, (3, 3), 0, borderType=cv2.BORDER_REPLICATE)
                if options["denoise"] else light)
    if options["illumination"]:
        scale = min(1, 128 / max(width, height))
        small = cv2.resize(denoised, (max(1, round(width * scale)),
                                      max(1, round(height * scale))), interpolation=cv2.INTER_AREA)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
        background = cv2.morphologyEx(small, cv2.MORPH_CLOSE, kernel)
        blurred = cv2.GaussianBlur(background, (15, 15), 0)
        field = cv2.resize(blurred, (width, height), interpolation=cv2.INTER_LINEAR)
        samples = blurred.ravel()
        reference = int(np.partition(samples, int(len(samples) * .9))[int(len(samples) * .9)]) or 1
        gain = np.clip(reference / np.maximum(field.astype(np.float32), 1), .9, 1.35)
        normalized = np.minimum(255, np.floor(denoised.astype(np.float32) * gain + .5)).astype(np.uint8)
    else:
        normalized = denoised.copy()
    if options["localContrast"]:
        normalized = cv2.createCLAHE(clipLimit=1.12, tileGridSize=(8, 8)).apply(normalized)
    lab[:, :, 0] = normalized
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sam-root", type=Path, required=True)
    args = parser.parse_args()
    root = args.sam_root.resolve()
    sys.path.insert(0, str(root))
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    from proposal_policy import largest_connected_component, select_proposals
    from carrier_policy import (find_composite_carriers, inside,
                                page_edge_artifact, merge_groups)
    from fastsam_hybrid import FastSamHybrid, smooth_mask
    from mask_alpha import encode_mask_alpha

    models = {
        "tiny": ("sam2.1_hiera_tiny.pt", "configs/sam2.1/sam2.1_hiera_t.yaml"),
        "small": ("sam2.1_hiera_small.pt", "configs/sam2.1/sam2.1_hiera_s.yaml"),
        "large": ("sam2.1_hiera_large.pt", "configs/sam2.1/sam2.1_hiera_l.yaml"),
    }
    device = "cuda" if torch.cuda.is_available() else "cpu"
    cache = {}
    fast_hybrid = None
    prompt_cache = OrderedDict()
    small_checkpoint, small_config = models["small"]
    cache["small"] = build_sam2(small_config, str(root / "checkpoints" / small_checkpoint),
                                  device=device, apply_postprocessing=False)
    print(json.dumps({"ready": True}), flush=True)

    def execute(job):
        started = time.perf_counter()
        model_size = job["model"]
        hybrid = model_size == "fastsam-sam2-small"
        if hybrid:
            model_size = "small"
        if model_size not in models:
            raise ValueError("Unsupported SAM model")
        checkpoint, config = models[model_size]
        source = Path(job["input"])
        output = Path(job["output"])
        source_bytes = source.read_bytes()
        source_image = Image.open(source)
        material_scope = job.get("scope") in ("material", "material-foreground", "material-detect-all")
        material_prompt = job.get("scope") == "material" and job.get("box") is not None
        if job.get("scope") not in (None, "material", "material-foreground", "material-detect-all") or (job.get("scope") == "material" and not material_prompt) or (job.get("scope") in ("material-foreground", "material-detect-all") and job.get("box") is not None):
            raise ValueError("Invalid material segmentation method or box")
        if material_scope:
            rgba = source_image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            image = np.array(Image.alpha_composite(background, rgba).convert("RGB"), copy=True)
        else:
            image = np.array(source_image.convert("RGB"), copy=True)
        height, width = image.shape[:2]
        if min(width, height) < (32 if material_scope else 600) or width * height > (4_000_000 if material_scope else 20_000_000):
            raise ValueError("SAM image size is out of bounds")
        ratio = width / height
        if not material_scope and min(abs(ratio - 297 / 210), abs(ratio - 210 / 297)) > .05:
            raise ValueError("Input is not a corrected A4 page")
        if model_size not in cache:
            cache[model_size] = build_sam2(config, str(root / "checkpoints" / checkpoint),
                                           device=device, apply_postprocessing=False)
        model = cache[model_size]
        preprocessing = job.get("preprocessing", {"illumination": False,
            "denoise": False, "localContrast": False})
        model_image = preprocess_image(image, preprocessing)
        context = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if device == "cuda" else torch.no_grad()
        materials = output / "materials"
        materials.mkdir(parents=True, exist_ok=True)
        background_masks = []
        subregion_masks = []
        with torch.inference_mode(), context:
            if job.get("box") is not None:
                box = job["box"]
                if len(box) != 4 or not (0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height):
                    raise ValueError("Invalid SAM box")
                # The same corrected page is copied for each prompt. Reuse its
                # encoded image features so later box edits only run the mask head.
                key = (model_size, hashlib.sha256(source_bytes).digest(),
                       tuple(preprocessing[name] for name in ("illumination", "denoise", "localContrast")))
                predictor = prompt_cache.get(key)
                if predictor is None:
                    predictor = SAM2ImagePredictor(model)
                    predictor.set_image(model_image)
                    prompt_cache[key] = predictor
                    if len(prompt_cache) > 2:
                        _, evicted = prompt_cache.popitem(last=False)
                        evicted.reset_predictor()
                else:
                    prompt_cache.move_to_end(key)
                masks, scores, _ = predictor.predict(box=np.asarray(box, dtype=np.float32),
                                                     multimask_output=True, return_logits=True)
                best = int(np.argmax(scores))
                mask, _, _ = largest_connected_component(masks[best] > 0)
                if hybrid:
                    mask = smooth_mask(mask)
                if material_scope:
                    mask &= np.asarray(rgba)[:, :, 3] >= 128
                    mask, _, _ = largest_connected_component(mask)
                candidates = [{"segmentation": mask, "soft_logits": masks[best],
                               "predicted_iou": float(scores[best]),
                               "container_id": None, "source_file": "prompt"}]
                groups = [candidates] if np.any(mask) else []
            elif hybrid:
                nonlocal fast_hybrid
                if fast_hybrid is None:
                    fast_hybrid = FastSamHybrid(root / "checkpoints" / "FastSAM-s.pt")
                items, background_masks, subregion_masks = fast_hybrid.segment(
                    image, model, device, refinement_image=model_image)
                groups = [[item] for item in items]
            else:
                points = int(job["pointsPerSide"])
                crops = int(job["cropNLayers"])
                granularity = job["granularity"]
                if points not in (8, 12, 16, 24, 32) or crops not in (0, 1, 2) or granularity not in ("coarse", "balanced", "fine"):
                    raise ValueError("Invalid SAM automatic parameters")
                generator = SAM2AutomaticMaskGenerator(model, points_per_side=points,
                    points_per_batch=128, pred_iou_thresh=.70, stability_score_thresh=.90,
                    crop_n_layers=crops, crop_n_points_downscale_factor=1,
                    min_mask_region_area=0)
                raw = generator.generate(model_image)
                selected, _ = select_proposals(raw, (width, height), "fine", 200)
                candidates = []
                for index, item in enumerate(selected):
                    mask = item["segmentation"]
                    ys, xs = np.nonzero(mask)
                    if not len(xs):
                        continue
                    candidates.append({"segmentation": mask,
                        "bbox_xyxy": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)],
                        "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1 - xs.min()), int(ys.max() + 1 - ys.min())],
                        "area": int(mask.sum()), "predicted_iou": item["predicted_iou"],
                        "stability_score": item["stability_score"], "point_coords": item["point_coords"],
                        "crop_box": item["crop_box"], "source_file": f"object-{index+1:03d}.png"})
                carriers = find_composite_carriers(candidates, image)
                # Preserve the underlying paper/card proposals for interactive
                # grouping. A union of foreground cutouts alone leaves the
                # shared background transparent, which is not one material.
                background_masks = [carrier["segmentation"] for carrier, _ in carriers[:12]]
                carrier_ids = {id(candidate): f"container-{index+1:02d}"
                               for index, (candidate, _) in enumerate(carriers)}
                pools = {None: []}
                for carrier_id in carrier_ids.values():
                    pools[carrier_id] = []
                for candidate in candidates:
                    if id(candidate) in carrier_ids or page_edge_artifact(candidate, width, height):
                        continue
                    matches = [(carrier_ids[id(carrier)], carrier["area"])
                               for carrier, _ in carriers if inside(candidate, carrier) >= .7]
                    container_id = min(matches, key=lambda pair: pair[1])[0] if matches else None
                    pools[container_id].append(candidate)
                filtered = []
                for container_id, pool in pools.items():
                    if not pool:
                        continue
                    local, _ = select_proposals(pool, (width, height), granularity, 500)
                    for item in local:
                        item["container_id"] = container_id
                    filtered.extend(local)
                groups = merge_groups(filtered, width, height)
                groups.sort(key=lambda group: (group[0]["container_id"] or "",
                    min(item["bbox_xyxy"][1] for item in group),
                    min(item["bbox_xyxy"][0] for item in group)))
            def packed_object(mask, logits=None):
                if material_scope:
                    mask = mask & (np.asarray(rgba)[:, :, 3] >= 128)
                ys, xs = np.nonzero(mask)
                if not len(xs):
                    return None
                x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
                packed = np.packbits(mask[y0:y1, x0:x1].ravel(), bitorder="little")
                item = {"bbox_xyxy": [x0, y0, x1, y1], "area": int(mask.sum()),
                        "maskBits": base64.b64encode(packed.tobytes()).decode("ascii"),
                        "maskAlphaZlib": encode_mask_alpha(mask[y0:y1, x0:x1],
                            logits[y0:y1, x0:x1] if logits is not None else None)}
                if material_scope:
                    # Source-relative contours retain holes and are used by the
                    # same physical cut validator as manual editable cutouts.
                    contours, hierarchy = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
                    geometry = []
                    def ring(index):
                        points = cv2.approxPolyDP(contours[index], .65, True).reshape(-1, 2)
                        if len(points) < 3 or abs(cv2.contourArea(points)) < 2:
                            return None
                        if len(points) > 1023:
                            raise ValueError("Segmentation contour is too complex")
                        result = [[float(x) / width, float(y) / height] for x, y in points]
                        return result + [result[0]]
                    if hierarchy is not None:
                        for index, relation in enumerate(hierarchy[0]):
                            if relation[3] != -1:
                                continue
                            outer = ring(index)
                            if outer is None:
                                continue
                            polygon = [outer]
                            child = relation[2]
                            while child != -1:
                                hole = ring(child)
                                if hole is not None:
                                    polygon.append(hole)
                                child = hierarchy[0][child][0]
                            geometry.append(polygon)
                    item["geometry"] = geometry
                return item
            def packed_subregion(node):
                packed = packed_object(node["segmentation"])
                if packed and node.get("subregions"):
                    packed["subregions"] = [child for source in node["subregions"]
                        if (child := packed_object(source["segmentation"]))]
                return packed
            objects = []
            for group_index, group in enumerate(groups):
                mask = np.zeros((height, width), dtype=bool)
                for member in group:
                    mask |= member["segmentation"]
                item = packed_object(mask, group[0].get("soft_logits") if len(group)==1 else None)
                if item:
                    if hybrid and group_index < len(subregion_masks):
                        item["subregions"] = [packed for child in subregion_masks[group_index]
                            if (packed := packed_subregion(child))]
                    elif not hybrid and 1 < len(group) <= 12:
                        item["subregions"] = [packed for member in group
                            if (packed := packed_object(member["segmentation"]))]
                    objects.append(item)
            backgrounds = [item for mask in background_masks if (item := packed_object(mask))]
        if len(objects) > 250:
            raise ValueError("Too many SAM materials")
        manifest = {"version": 2, "width": width, "height": height,
                    "model": "fastsam-sam2-small" if hybrid else "sam2-" + model_size,
                    "objects": objects,
                    "backgrounds": backgrounds}
        (materials / "result.json").write_text(json.dumps(manifest))
        return {"objects": len(objects), "milliseconds": round((time.perf_counter() - started) * 1000)}

    for line in sys.stdin:
        request = None
        try:
            request = json.loads(line)
            response = {"id": request["id"], "ok": True, **execute(request)}
        except Exception as error:
            traceback.print_exc(file=sys.stderr)
            response = {"id": request.get("id") if isinstance(request, dict) else None,
                        "ok": False, "error": str(error)[:300]}
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()

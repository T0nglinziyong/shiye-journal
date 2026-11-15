"""Resident SAM 2.1 worker for corrected, compact A4 input images.

One JSON job per stdin line, one JSON reply per stdout line. Keeping PyTorch
and the model resident avoids cold Python startup on every phone request.
"""

import argparse
import base64
import json
import sys
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image
import torch


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
    from postprocess_results import (find_composite_carriers, inside,
                                     page_edge_artifact, merge_groups)

    models = {
        "tiny": ("sam2.1_hiera_tiny.pt", "configs/sam2.1/sam2.1_hiera_t.yaml"),
        "small": ("sam2.1_hiera_small.pt", "configs/sam2.1/sam2.1_hiera_s.yaml"),
        "large": ("sam2.1_hiera_large.pt", "configs/sam2.1/sam2.1_hiera_l.yaml"),
    }
    device = "cuda" if torch.cuda.is_available() else "cpu"
    cache = {}
    small_checkpoint, small_config = models["small"]
    cache["small"] = build_sam2(small_config, str(root / "checkpoints" / small_checkpoint),
                                  device=device, apply_postprocessing=False)
    print(json.dumps({"ready": True}), flush=True)

    def execute(job):
        started = time.perf_counter()
        model_size = job["model"]
        if model_size not in models:
            raise ValueError("Unsupported SAM model")
        checkpoint, config = models[model_size]
        source = Path(job["input"])
        output = Path(job["output"])
        image = np.array(Image.open(source).convert("RGB"), copy=True)
        height, width = image.shape[:2]
        if min(width, height) < 600 or width * height > 20_000_000:
            raise ValueError("SAM image size is out of bounds")
        ratio = width / height
        if min(abs(ratio - 297 / 210), abs(ratio - 210 / 297)) > .05:
            raise ValueError("Input is not a corrected A4 page")
        if model_size not in cache:
            cache[model_size] = build_sam2(config, str(root / "checkpoints" / checkpoint),
                                           device=device, apply_postprocessing=False)
        model = cache[model_size]
        context = torch.autocast(device_type="cuda", dtype=torch.bfloat16) if device == "cuda" else torch.no_grad()
        materials = output / "materials"
        materials.mkdir(parents=True, exist_ok=True)
        background_masks = []
        with torch.inference_mode(), context:
            if job.get("box") is not None:
                box = job["box"]
                if len(box) != 4 or not (0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height):
                    raise ValueError("Invalid SAM box")
                predictor = SAM2ImagePredictor(model)
                predictor.set_image(image)
                masks, scores, _ = predictor.predict(box=np.asarray(box, dtype=np.float32),
                                                     multimask_output=True)
                best = int(np.argmax(scores))
                mask, _, _ = largest_connected_component(masks[best])
                candidates = [{"segmentation": mask, "predicted_iou": float(scores[best]),
                               "container_id": None, "source_file": "prompt"}]
                groups = [candidates] if np.any(mask) else []
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
                raw = generator.generate(image)
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
            def packed_object(mask):
                ys, xs = np.nonzero(mask)
                if not len(xs):
                    return None
                x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)
                packed = np.packbits(mask[y0:y1, x0:x1].ravel(), bitorder="little")
                return {"bbox_xyxy": [x0, y0, x1, y1], "area": int(mask.sum()),
                        "maskBits": base64.b64encode(packed.tobytes()).decode("ascii")}
            objects = []
            for group in groups:
                mask = np.zeros((height, width), dtype=bool)
                for member in group:
                    mask |= member["segmentation"]
                item = packed_object(mask)
                if item:
                    objects.append(item)
            backgrounds = [item for mask in background_masks if (item := packed_object(mask))]
        if len(objects) > 250:
            raise ValueError("Too many SAM materials")
        manifest = {"version": 2, "width": width, "height": height,
                    "model": "sam2-" + model_size, "objects": objects,
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

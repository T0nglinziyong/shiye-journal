"""Resident material orientation inference on the corrected page."""

import base64
import json
import os
import sys
import traceback
import math
from pathlib import Path

os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", "BOS")
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

import numpy as np
from PIL import Image
from paddleocr import DocImgOrientationClassification
from rapidocr import RapidOCR
from rightwayup import Orienter

from orientation_policy import choose_orientation


ocr = RapidOCR(params={"EngineConfig.onnxruntime.use_cuda": True,
                       "Global.log_level": "error"})
text_direction = DocImgOrientationClassification(
    model_name="PP-LCNet_x1_0_doc_ori", device="gpu:0", engine="onnxruntime")
image_direction = Orienter(tier="fast", device="cpu", precision="int8",
                           abstain="strict", threads=2)
print(json.dumps({"ready": True}), flush=True)


def text_locations(image):
    result = ocr(image)
    places = []
    for box, content, confidence in zip(result.boxes if result.boxes is not None else [],
                                        result.txts if result.txts is not None else [],
                                        result.scores if result.scores is not None else []):
        if confidence < .8 or sum(ch.isalnum() for ch in content) < 2:
            continue
        xy = np.asarray(box, dtype=np.float32)
        places.append((float(xy[:, 0].mean()), float(xy[:, 1].mean())))
    return places


def run(job):
    image = np.asarray(Image.open(job["input"]).convert("RGB"))
    manifest_path = Path(job["manifest"])
    manifest = json.loads(manifest_path.read_text())
    if manifest["width"] != image.shape[1] or manifest["height"] != image.shape[0]:
        raise ValueError("Orientation page size mismatch")
    objects = manifest["objects"]
    if not isinstance(objects, list) or len(objects) > 250:
        raise ValueError("Invalid orientation object count")
    locations = job.get("locations")
    if locations is None:
        locations = text_locations(image)
    elif (not isinstance(locations, list) or len(locations) > 2000 or
          any(not isinstance(point, list) or len(point) != 2 or
              any(not isinstance(value, (int, float)) or not math.isfinite(value)
                  for value in point) for point in locations)):
        raise ValueError("Invalid prepared OCR locations")
    for item in objects:
        x0, y0, x1, y1 = item["bbox_xyxy"]
        if not (0 <= x0 < x1 <= image.shape[1] and 0 <= y0 < y1 <= image.shape[0]):
            raise ValueError("Invalid orientation object bounds")
        crop = image[y0:y1, x0:x1]
        packed = np.frombuffer(base64.b64decode(item["maskBits"]), dtype=np.uint8)
        mask = np.unpackbits(packed, bitorder="little")[:(y1-y0)*(x1-x0)].reshape(y1-y0, x1-x0)
        text_count = sum(x0 <= x < x1 and y0 <= y < y1 and
                         bool(mask[int(y)-y0, int(x)-x0]) for x, y in locations)
        ocr_angle, ocr_confidence = 0, 0.0
        if text_count:
            result = next(iter(text_direction.predict(crop, batch_size=1)))
            ocr_angle = int(result["label_names"][0])
            ocr_confidence = float(result["scores"][0])
        right = image_direction.predict(crop)
        chosen = choose_orientation(text_count, ocr_angle, ocr_confidence,
                                    right.angle_cw, right.confidence, right.abstain)
        if chosen:
            item["orientation"] = chosen
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":")))
    return {"objects": len(objects), "textLocations": len(locations)}


for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        if request.get("stage") == "prepare":
            image = np.asarray(Image.open(request["input"]).convert("RGB"))
            locations = text_locations(image)
            response = {"id": request["id"], "ok": True, "locations": locations}
        else:
            response = {"id": request["id"], "ok": True, **run(request)}
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        response = {"id": request.get("id") if isinstance(request, dict) else None,
                    "ok": False, "error": str(error)[:300]}
    print(json.dumps(response), flush=True)

#!/usr/bin/env python3
"""Convert a ShiyeJournal v2–v4 binary-plist backup to an offline PWA import.

No network or third-party packages. The original backup is never modified.
PencilKit drawing bytes and fields not rendered in the PWA are retained as
legacy metadata; they are not silently presented as editable strokes.
"""
import argparse
import base64
import datetime as dt
import json
import plistlib
from pathlib import Path


def normal(value):
    if isinstance(value, dt.datetime):
        return value.replace(tzinfo=dt.timezone.utc).isoformat()
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, dict):
        return {str(k): normal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normal(v) for v in value]
    return value


def blob_record(record, field, key, blobs):
    source = record.get(field)
    if not source or not isinstance(source.get("data"), bytes):
        return None
    extension = str(source.get("pathExtension") or "png").lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "heic": "image/heic", "webp": "image/webp", "pdf": "application/pdf"}.get(extension, "application/octet-stream")
    encoded = base64.b64encode(source["data"]).decode("ascii")
    blobs.append({"id": key, "data": f"data:{mime};base64,{encoded}"})
    return key


def convert_draft(raw):
    d = normal(raw)
    d["pageMode"] = {"单页": "single", "双页": "spread"}.get(d.get("pageMode"), d.get("pageMode", "single"))
    d["pageRatio"] = {"A4 比例": "a4", "A5 比例": "a5", "A6 比例": "a6",
                      "B5 比例": "b5", "3:4": "portrait", "1:1": "square", "4:3": "landscape"}.get(d.get("pageRatio"), "a4")
    d["paperPattern"] = {"纯色": "plain", "方格": "grid", "横线": "lines", "点阵": "dots"}.get(d.get("paperPattern"), "plain")
    d["strokes"] = []
    d.setdefault("items", [])
    d.setdefault("textBlocks", [])
    d.setdefault("primitives", [])
    for item in d["items"]:
        item.setdefault("isParked", item.get("isParked", False))
        item.setdefault("opacity", 1)
        item.setdefault("zIndex", 10)
    for text in d["textBlocks"]:
        text["style"] = {"serif": "serif", "sans": "sans", "rounded": "rounded"}.get(text.get("style"), "serif")
        text.setdefault("zIndex", 1001)
    return d


def convert(source):
    archive = plistlib.loads(Path(source).read_bytes())
    version = archive.get("formatVersion")
    if not isinstance(version, int) or version not in range(2, 5):
        raise ValueError("仅支持 Swift 拾页 .shiyebackup 格式 2–4")
    stores = {x: [] for x in ("assets", "blobs", "series", "projects", "meta", "trash")}
    for record in archive.get("assets", []):
        raw = record["asset"]
        a = normal(raw)
        aid = str(a["id"])
        variants = {field: blob_record(record, field, aid+"-"+field, stores["blobs"])
                    for field in ("image", "cover", "sourceROI", "colorROI", "visionMask", "editedMask")}
        a.update(blobId=variants["image"] or variants["cover"],
                 originalBlobId=variants["sourceROI"] or variants["image"] or variants["cover"],
                 coverBlobId=variants["cover"], colorROIBlobId=variants["colorROI"],
                 visionMaskBlobId=variants["visionMask"], editedMaskBlobId=variants["editedMask"],
                 tags=list(a.get("tags") or []), reviewStatus=a.get("reviewStatus", "pendingReview"))
        a["id"] = aid
        if record.get("deletedAt"):
            stores["trash"].append({"id":aid+"-deleted", "kind":"asset", "item":a, "date":normal(record["deletedAt"])})
        else:
            stores["assets"].append(a)
    for record in archive.get("projects", []):
        raw = record["project"]
        p = normal(raw)
        p["id"] = str(p["id"])
        p["drafts"] = [convert_draft(x) for x in raw.get("drafts", [])]
        p["coverBlobId"] = blob_record(record, "cover", p["id"]+"-projectCover", stores["blobs"])
        drawing = raw.get("drawingData")
        if drawing:
            p["legacyPencilKitData"] = base64.b64encode(drawing).decode("ascii")
        p.pop("drawingData", None)
        p.setdefault("manualArchives", [])
        p.setdefault("editHistory", {"undo": [], "redo": []})
        if record.get("deletedAt"):
            stores["trash"].append({"id":p["id"]+"-deleted", "kind":"project", "item":p, "date":normal(record["deletedAt"])})
        else:
            stores["projects"].append(p)
    stores["series"] = [normal(s) for s in archive.get("series") or []]
    stores["meta"].append({"id":"swift-migration", "formatVersion":version,
                           "createdAt":normal(archive.get("createdAt")),
                           "recommendationEvents":normal(archive.get("recommendationEvents") or []),
                           "note":"PencilKit 轨迹保留为 legacyPencilKitData，PWA 暂不能编辑；所有备份内图像变体已保留。API 密钥不会转移到网页。"})
    return {"format":"shiye-pwa", "version":1, "createdAt":dt.datetime.now(dt.timezone.utc).isoformat(), "stores":stores}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",type=Path,help="Swift 导出的 .shiyebackup")
    parser.add_argument("destination",type=Path,help="输出 .shiyepwa 路径")
    args=parser.parse_args()
    result=convert(args.source)
    args.destination.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"已转换 {len(result['stores']['assets'])} 件素材、{len(result['stores']['projects'])} 件作品：{args.destination}")


if __name__=="__main__":main()

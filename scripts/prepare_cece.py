"""Convert the four bundled Swift example pages into PWA seed data.

Run from the PWA project root. The source bundle is expected beside this repo.
The generated collection is intentionally limited to the bundled examples;
it never reads an app backup or a user's private photo directory.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent.parent / "ShiyeJournalFresh.swiftpm/Resources/CeCeWorks"
TARGET = ROOT / "public/cece"
data = json.loads((SOURCE / "cece-editable-v3.json").read_text())
paragraph_archive = json.loads((SOURCE / "cece-paragraphs-v1.json").read_text())
paragraphs_by_page = {page["page"]: page["paragraphs"] for page in paragraph_archive["pages"]}
TARGET.mkdir(parents=True, exist_ok=True)
assets, projects, filenames = [], [], set()

for page in data["pages"]:
    number = page["page"]
    items = []
    for material in page["materials"]:
        filename = material["source"]
        filenames.add(filename)
        asset_id = f"cece-p{number}-m{material['originalIndex']}"
        x, y, w, h = material["rect"]
        assets.append({
            "id": asset_id, "title": material["title"], "kind": "sticker",
            "role": "support", "tags": ["CeCe样例", f"第{number}页"],
            "palette": [], "texture": "纸质贴图", "blobId": asset_id,
            "originalBlobId": asset_id, "physicalWidthMM": w/page["height"]*210,
            "physicalHeightMM": h/page["height"]*210,
            "dimensionSource": "sample-pdf", "supply": {"kind": "single", "quantity": 1},
            "reviewStatus": "ready", "seriesID": "cece-sample-series",
            "sourceIdentifier": "cece-pdf-component", "createdAt": "2026-09-27T00:00:00Z",
            "sampleFile": filename,
        })
        items.append({
            "id": f"{asset_id}-item", "assetID": asset_id,
            "x": x+w/2, "y": y+h/2, "width": w, "height": h,
            "rotation": 0, "zIndex": round(material["z"]*10),
            "isLocked": False, "isParked": False, "cropZoom": 1,
            "cropOffsetX": 0, "cropOffsetY": 0,
            "isFlippedHorizontally": False, "opacity": 1,
            "generationBaseline": {"x": x+w/2, "y": y+h/2, "width": w,
                                   "height": h, "rotation": 0,
                                   "zIndex": round(material["z"]*10)},
            "materialUnitIndex": 0, "userOverrideFlags": [],
        })
    texts = []
    source_lines = {}
    for index, line in enumerate(page["texts"]):
        x, y, w, h = line["rect"]
        if not line["handwritten"]:
            filename = line["source"]
            filenames.add(filename)
            asset_id = f"cece-p{number}-print-{index}"
            crop = line.get("sourceRect", [0, 0, 1, 1])
            assets.append({"id": asset_id, "title": line["text"], "kind": "text", "role": "annotation", "tags": ["CeCe样例", "原版印刷图形"], "reviewStatus": "ready", "isProjectInternal": True, "seriesID": None, "physicalWidthMM": w/crop[2]/page["height"]*210, "physicalHeightMM": h/crop[3]/page["height"]*210, "dimensionSource": "sample-pdf", "supply": {"kind": "single", "quantity": 1}, "blobId": asset_id, "originalBlobId": asset_id, "sampleFile": filename, "createdAt": "2026-09-27T00:00:00Z"})
            items.append({"id": asset_id+"-item", "assetID": asset_id, "x": x+w/2, "y": y+h/2, "width": w, "height": h, "rotation": 0, "cropRect": {"x": crop[0], "y": crop[1], "width": crop[2], "height": crop[3]}, "opacity": 1, "zIndex": round(line["z"]*10), "isParked": False, "materialUnitIndex": 0, "userOverrideFlags": []})
            continue
        block = {
            "id": f"cece-p{number}-text-{index}", "content": line["text"],
            "x": x+w/2, "y": y+h/2, "width": w, "height": h,
            "fontSize": max(6, h), "style": "hand", "fontName": "Ma Shan Zheng",
            "color": line["color"], "zIndex": round(line["z"]*10),
            "rotation": 0, "alignment": "left", "bold": line["bold"],
            "italic": False,
        }
        texts.append(block)
        source_lines[(line["group"], line["line"])] = block
    upgrades = []
    for paragraph in paragraphs_by_page.get(number, []):
        if not paragraph["handwritten"]:
            continue
        sources = [source_lines.get((ref["group"], ref["line"])) for ref in paragraph["sourceLines"]]
        if not sources or any(source is None for source in sources):
            continue
        x, y, w, h = paragraph["rect"]
        # The old paragraph archive contains contextual rewrites. Preserve the
        # literal line transcription instead; unclear glyphs remain explicit.
        content = "\n".join(source["content"] for source in sources) if paragraph["contextualRewrite"] else paragraph["content"]
        combined = {
            "id": sources[0]["id"], "content": content,
            "x": x+w/2, "y": y+max(h+3, len(content.split("\n"))*paragraph["lineHeight"]+3)/2,
            "width": w+3, "height": max(h+3, len(content.split("\n"))*paragraph["lineHeight"]+3),
            "fontSize": paragraph["fontSize"],
            "lineHeight": paragraph["lineHeight"],
            "style": "hand", "fontName": "Ma Shan Zheng",
            "color": paragraph["color"], "zIndex": round(paragraph["z"]*10),
            "rotation": 0, "alignment": "left", "bold": paragraph["bold"],
            "italic": False, "contextualRewrite": False, "needsTranscriptionReview": "□" in content,
        }
        upgrades.append({"sources": sources, "replacement": combined})
        removed = {source["id"] for source in sources}
        texts = [text for text in texts if text["id"] not in removed]
        texts.append(combined)
    shapes = []
    for index, shape in enumerate(page["shapes"]):
        x, y, w, h = shape["rect"]
        shapes.append({
            "id": f"cece-p{number}-shape-{index}",
            "kind": "vector" if shape.get("paths") else "rectangle",
            "x": x+w/2, "y": y+h/2, "width": max(1,w), "height": max(1,h),
            "rotation": 0, "zIndex": round(shape["z"]*10),
            "fill": shape.get("fill") or "transparent",
            "stroke": shape.get("stroke") or "transparent",
            "lineWidth": shape.get("lineWidth") or 0,
            "opacity": shape.get("opacity",1), "hidden": False,
            "locked": False, "vectorPaths": shape.get("paths") or [],
        })
    draft_id = f"cece-p{number}-draft"
    draft = {
        "id": draft_id, "style": "free",
        "canvas": {"width": page["width"], "height": page["height"]},
        "pageMode": "spread", "pageRatio": "portrait",
        "physicalPageHeightMM": 210, "paperColor": "#FFFFFF",
        "paperPattern": "lines", "items": items,
        "textBlocks": texts, "primitives": shapes,
        "strokes": [], "makingSteps": [], "createdAt": "2026-09-27T00:00:00Z",
    }
    projects.append({
        "id": f"cece-p{number}-project", "title": page["title"],
        "drafts": [draft], "activeDraftID": draft_id,
        "source": "imported", "isTemplate": False, "isDraft": False,
        "styleTags": ["CeCe样例", "文字可编辑"],
        "candidateAssetIDs": [item["assetID"] for item in items],
        "updatedAt": "2026-09-27T00:00:00Z",
        "lastOpenedAt": "2026-09-27T00:00:00Z",
        "editHistory": {"undo": [], "redo": []}, "manualArchives": [],
        "sampleParagraphUpgrades": upgrades,
    })

for filename in filenames:
    shutil.copyfile(SOURCE / filename, TARGET / filename)
collection = {
    "format": "shiye-bundled-cece", "version": 2,
    "series": {"id": "cece-sample-series", "title": "CeCe 的寒假手帐",
               "introduction": "Swift 2.0.10 随应用提供的四页可编辑样例",
               "createdAt": "2026-09-27T00:00:00Z",
               "updatedAt": "2026-09-27T00:00:00Z"},
    "assets": assets, "projects": projects,
}
(TARGET / "collection.json").write_text(json.dumps(collection,ensure_ascii=False,separators=(",", ":")))
print(f"Prepared {len(assets)} assets and {len(projects)} projects, {len(filenames)} images")

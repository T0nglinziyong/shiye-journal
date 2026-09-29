"""Convert the four bundled Swift example pages into PWA seed data.

Run from the PWA project root. The source bundle is expected beside this repo.
The generated collection is intentionally limited to the bundled examples;
it never reads an app backup or a user's private photo directory.
"""
import json
import shutil
import unicodedata
from collections import defaultdict
from PIL import Image
import numpy as np
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
    printed_groups = set()
    for index, line in enumerate(page["texts"]):
        x, y, w, h = line["rect"]
        if not line["handwritten"] or line.get("family") == "number":
            if line["source"] in printed_groups:
                continue
            printed_groups.add(line["source"])
            filename = line["source"]
            filenames.add(filename)
            asset_id = f"cece-p{number}-print-{index}"
            crop = line.get("sourceRect", [0, 0, 1, 1])
            # Reuse each complete printed component, rather than splitting it
            # into OCR-line crops (which clipped glyphs and omitted whitespace).
            w, h = w/crop[2], h/crop[3]
            x, y = x-crop[0]*w, y-crop[1]*h
            crop = [0, 0, 1, 1]
            assets.append({"id": asset_id, "title": line["text"], "kind": "text", "role": "annotation", "tags": ["CeCe样例", "原版印刷图形"], "reviewStatus": "ready", "isProjectInternal": True, "seriesID": None, "physicalWidthMM": w/crop[2]/page["height"]*210, "physicalHeightMM": h/crop[3]/page["height"]*210, "dimensionSource": "sample-pdf", "supply": {"kind": "single", "quantity": 1}, "blobId": asset_id, "originalBlobId": asset_id, "sampleFile": filename, "createdAt": "2026-09-27T00:00:00Z"})
            items.append({"id": asset_id+"-item", "assetID": asset_id, "x": x+w/2, "y": y+h/2, "width": w, "height": h, "rotation": 0, "cropRect": {"x": crop[0], "y": crop[1], "width": crop[2], "height": crop[3]}, "opacity": 1, "zIndex": round(line["z"]*10), "isParked": False, "materialUnitIndex": 0, "userOverrideFlags": []})
            continue
        # Each original line has its own placement, including text wrapped
        # around stickers. Combining these into rectangular paragraphs loses
        # indentation, mixed baselines and reading order.
        corrections = {
            ("1-024", 1): "为什么选这么恶心的课",
            ("1-025", 1): "自我怀疑！",
            ("1-026", 1): "真心累",
            ("1-034", 1): "考试前，我还心存幻想，想要",
            ("1-034", 3): "结果，呜，它就只停留在了幻",
            ("1-047", 1): "肥，她的脸上都是红血丝。",
            ("1-047", 2): "感觉我们俩全程握着手，真心",
            ("1-056", 1): "家之旅，迫不及待…！",
            ("1-056", 2): "学校的 bus 把我们拉",
            ("1-056", 4): "然后就是坐地铁去机场！",
            ("2-033", 1): "一些韩系贴纸的手帐……",
            ("2-035", 1): "今天又是早早醒的（6点左右？）",
            ("2-042", 1): "今天干饭超顺畅",
            ("2-042", 2): "也不是 就是饿",
            ("2-042", 3): "好吃没得说",
            ("2-043", 6): "事，今天看完结局的时候，",
            ("3-028", 1): "Absolutely schedule correspond with the old people!",
            ("4-025", 3): "外套，卡其风衣，黑卫裤。呜！幸福！",
            ("4-043", 1): "今天过完这学期学的",
        }
        content = corrections.get((line["group"], line["line"]), line["text"])
        units = sum(1 if unicodedata.east_asian_width(ch) in "WF" else .62 for ch in content)
        size = max(2, min(h*.88, w/max(1, units)))
        block = {
            "id": f"cece-p{number}-text-{index}", "content": content,
            "x": x+w/2, "y": y+h/2, "width": w, "height": h,
            "fontSize": size, "fixedLineHeight": h, "style": "hand", "fontName": "Ma Shan Zheng",
            "sourceGroup": line["group"], "sourceLine": line["line"], "needsTranscriptionReview": "□" in content,
            "color": line["color"], "zIndex": round(line["z"]*10),
            "rotation": 0, "alignment": "left", "bold": line["bold"],
            "italic": False,
        }
        texts.append(block)
        source_lines[(line["group"], line["line"])] = block
    upgrades = []
    for paragraph in []:  # Kept for archive compatibility; do not merge lines.
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
    grouped = defaultdict(list)
    for shape in page["shapes"]:
        if not shape.get("source"):
            x,y,w,h = shape["rect"]
            shapes.append({"id":f"cece-p{number}-base-{len(shapes)}","kind":shape["kind"],"title":shape["title"],"x":x+w/2,"y":y+h/2,"width":w,"height":h,"fill":shape["fill"],"stroke":"transparent","lineWidth":0,"opacity":shape.get("opacity",1),"zIndex":round(shape["z"]*10),"rotation":0,"locked":False,"hidden":False})
            continue
        grouped[shape["source"]].append(shape)
    for index, (source, components) in enumerate(grouped.items()):
        # Pillow's adaptive RGBA palette retains pale fills and transparency.
        # Numeric pixel-edge geometry below avoids contour-center cracks.
        im = Image.open(SOURCE/source).convert("RGBA")
        quantized = im.quantize(colors=48, method=Image.Quantize.FASTOCTREE).convert("RGBA")
        pixels = np.asarray(quantized)
        bbox = im.getbbox() or (0,0,im.width,im.height)
        # Contours pass through pixel centers, leaving cracks between adjoining
        # color regions. Encode the quantized masks as merged pixel-edge boxes
        # instead: SVG stays numeric/editable and covers EVERY source pixel.
        layers = []
        for color in np.unique(pixels.reshape(-1,4),axis=0):
            if color[3] == 0:
                continue
            mask = np.all(pixels == color,axis=2)
            active, boxes = {}, []
            for row in range(im.height):
                edges = np.flatnonzero(np.diff(np.pad(mask[row].astype(np.int8),(1,1))))
                runs = set(zip(edges[::2],edges[1::2]))
                for key in list(active):
                    if key not in runs:
                        boxes.append((*key,active.pop(key),row))
                for key in runs:
                    active.setdefault(key,row)
            boxes.extend((*key,start,im.height) for key,start in active.items())
            rects = [[int(left),int(top),int(right-left),int(bottom-top)] for left,right,top,bottom in boxes]
            layers.append({"rects":rects,"fill":"#%02x%02x%02x"%tuple(color[:3]),"opacity":round(int(color[3])/255,4)})
        x = min(c["rect"][0] for c in components)-bbox[0]/3
        y = min(c["rect"][1] for c in components)-bbox[1]/3
        w, h = im.width/3, im.height/3
        shape = components[0]
        shapes.append({
            "id": f"cece-p{number}-shape-{index}",
            "kind": "vector", "title": shape["title"].replace(" · 矢量色层", ""),
            "x": x+w/2, "y": y+h/2, "width": max(1,w), "height": max(1,h),
            "rotation": 0, "zIndex": round(shape["z"]*10),
            "fill": shape.get("fill") or "transparent",
            "stroke": shape.get("stroke") or "transparent",
            "lineWidth": shape.get("lineWidth") or 0,
            "opacity": 1, "hidden": False,
            "locked": False, "vectorLayers": layers, "vectorSize": [im.width,im.height],
        })
    draft_id = f"cece-p{number}-draft"
    draft = {
        "id": draft_id, "style": "free",
        "canvas": {"width": page["width"], "height": page["height"]},
        "pageMode": "spread", "pageRatio": "portrait",
        "physicalPageHeightMM": 210, "paperColor": "#FFFFFF",
        "paperPattern": "lines",
        "paperRuling": {"rowPositions": [v/595.2760009765625 for v in [49.3016,67.037,84.7724,102.5087,120.244,137.9794,155.7148,173.4511,191.1864,208.9218,226.6581,244.3935,262.1288,279.8642,297.6005,315.3358,333.0712,350.8075,368.5429,386.2782,404.0136,421.7499,439.4853,457.2206,474.9569,492.6923,510.4276,528.163,545.8993]], "spans": [{"from": 29.16/841.8900146484375, "to": 414.78302/841.8900146484375}, {"from": 426.398986/841.8900146484375, "to": 812.72998/841.8900146484375}], "color": "#d0d2d3", "relativeLineWidth": .353/595.2760009765625},
        "items": items,
        "textBlocks": texts, "primitives": shapes,
        "strokes": [], "makingSteps": [], "createdAt": "2026-09-27T00:00:00Z",
    }
    projects.append({
        "id": f"cece-p{number}-project", "title": page["title"], "sampleRevision": 4,
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
(TARGET / "shapes.json").write_text(json.dumps([s for p in projects for d in p["drafts"] for s in d["primitives"]],ensure_ascii=False,separators=(",", ":")))
print(f"Prepared {len(assets)} assets and {len(projects)} projects, {len(filenames)} images")

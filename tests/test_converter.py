import datetime as dt
import plistlib
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from convert_swift_backup import convert


class ConversionTest(unittest.TestCase):
    def test_binary_plist_asset_and_project(self):
        raw={"formatVersion":4,"createdAt":dt.datetime(2026,9,28),
             "assets":[{"asset":{"id":"a","title":"贴纸","kind":"sticker","tags":["花"],"physicalWidthMM":25,"physicalHeightMM":30},
                        "image":{"data":b"\x89PNG test","pathExtension":"png"},
                        "sourceROI":{"data":b"source","pathExtension":"jpg"},
                        "editedMask":{"data":b"mask","pathExtension":"png"}}],
             "projects":[{"project":{"id":"p","title":"作品","drafts":[{"id":"d","pageMode":"单页","pageRatio":"A4 比例","paperPattern":"纯色","items":[]}],"drawingData":b"ink"},
                          "cover":{"data":b"cover","pathExtension":"png"}}],"series":[],
             "recommendationEvents":[{"candidateAssetID":"a","type":"shown"}],
             "apiConfiguration":{"apiKey":"must-not-copy"}}
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"backup.shiyebackup";path.write_bytes(plistlib.dumps(raw,fmt=plistlib.FMT_BINARY))
            result=convert(path)
        self.assertEqual(result["stores"]["assets"][0]["physicalWidthMM"],25)
        self.assertEqual(result["stores"]["projects"][0]["drafts"][0]["pageMode"],"single")
        self.assertEqual(result["stores"]["projects"][0]["legacyPencilKitData"],"aW5r")
        self.assertTrue(result["stores"]["blobs"][0]["data"].startswith("data:image/png;base64,"))
        self.assertEqual(len(result["stores"]["blobs"]),4)
        self.assertEqual(result["stores"]["assets"][0]["editedMaskBlobId"],"a-editedMask")
        self.assertEqual(result["stores"]["projects"][0]["coverBlobId"],"p-projectCover")
        self.assertEqual(result["stores"]["meta"][0]["recommendationEvents"][0]["type"],"shown")
        self.assertNotIn("must-not-copy",str(result))

if __name__=="__main__":unittest.main()

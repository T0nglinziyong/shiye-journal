# Craft v2 implementation verification

Run: https://github.com/T0nglinziyong/shiye-journal/actions/runs/37039192542
Starting branch commit: 9f075b37580b50b3f8353a175a2a174822db2cc2
Node: v24.21.0

The guarded source transformation ran before tests. The following commands completed successfully:
- npm run build
- npm test
- npm run test:ui
- python3 -m unittest discover -s tests -p 'test_*.py'
- git diff --check

Unit summary:
✔ almost rectangular paper repairs a small bitten edge without a jagged contour (172.510874ms)
✔ model contour fills printed white holes but preserves a concave material boundary (1.606865ms)
✔ GrabCut removes an attached neutral shadow without clipping coloured paper (143.887831ms)
✔ OpenCV contours preserve candidate bounds, fill printed detail and reject page-sized components (2.186224ms)
✔ OpenCV local light balance is effective without changing source or alpha (193.161ms)
✔ OpenCV detects actual paper corners and refuses a featureless full photograph (31.518425ms)
✔ shadow-only components are excluded while a colored object remains intact (2.224185ms)
ℹ tests 367
ℹ suites 0
ℹ pass 367
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 17178.678888

These are synthetic/unit and Happy DOM smoke checks, not physical iPad/Safari or paid-model quality acceptance.
No user database, private images, keys, DNS, or deployment configuration was changed.

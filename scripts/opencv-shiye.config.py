# ShiyeJournal minimal OpenCV.js binding whitelist.
# Consumed by OpenCV 5.0.0 platforms/js/build_js.py --config.
#
# Keep this list aligned with src/opencv-worker.js and recognition modules.
# Core binding classes (Mat, MatVector, Point, Rect, Size, Scalar,
# RotatedRect helpers such as boxPoints) are supplied by OpenCV's JS core
# bindings; this whitelist restricts exported algorithm functions/classes.

core = {
    '': [
        'addWeighted',
        'bitwise_and',
        'bitwise_not',
        'bitwise_or',
        'countNonZero',
        'merge',
        'split',
        'subtract',
    ],
    'Algorithm': [],
}

imgproc = {
    '': [
        'approxPolyDP',
        'arcLength',
        'boundingRect',
        'Canny',
        'circle',
        'connectedComponentsWithStats',
        'contourArea',
        'convexHull',
        'cvtColor',
        'dilate',
        'distanceTransform',
        'drawContours',
        'erode',
        'findContours',
        'fitEllipse',
        'fitLine',
        'GaussianBlur',
        'getPerspectiveTransform',
        'getStructuringElement',
        'grabCut',
        'HoughCircles',
        'HoughLinesP',
        'isContourConvex',
        'medianBlur',
        'minAreaRect',
        'moments',
        'morphologyEx',
        'pointPolygonTest',
        'resize',
        'Scharr',
        'Sobel',
        'threshold',
        'warpPerspective',
        'watershed',
    ],
    'CLAHE': [
        'apply',
        'collectGarbage',
        'getClipLimit',
        'getTilesGridSize',
        'setClipLimit',
        'setTilesGridSize',
    ],
}

photo = {
    '': ['inpaint'],
}

white_list = makeWhiteList([core, imgproc, photo])

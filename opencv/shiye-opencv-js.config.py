# ShiyeJournal minimal OpenCV.js binding whitelist.
# Loaded by OpenCV's official platforms/js/build_js.py via --config.
# Keep this list synchronized with the recognition engine API audit.

core = {
    '': [
        'addWeighted',
        'bitwise_and', 'bitwise_not', 'bitwise_or',
        'countNonZero',
        'merge', 'split', 'subtract',
    ],
}

imgproc = {
    '': [
        'approxPolyDP', 'arcLength', 'boundingRect', 'boxPoints',
        'Canny', 'circle', 'connectedComponentsWithStats',
        'contourArea', 'convexHull', 'cvtColor',
        'dilate', 'distanceTransform', 'drawContours', 'erode',
        'findContours', 'fitEllipse', 'fitLine',
        'GaussianBlur', 'getPerspectiveTransform', 'getStructuringElement',
        'grabCut', 'HoughCircles', 'isContourConvex',
        'medianBlur', 'minAreaRect', 'moments', 'morphologyEx',
        'pointPolygonTest', 'resize', 'Sobel', 'threshold',
        'warpPerspective', 'watershed',
    ],
    'CLAHE': ['apply'],
}

photo = {
    '': ['inpaint'],
}

white_list = makeWhiteList([core, imgproc, photo])

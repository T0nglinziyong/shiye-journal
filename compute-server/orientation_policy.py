"""Choose a material direction from text, image content, then geometry."""


def correction(angle):
    return (-float(angle) + 180) % 360 - 180


def choose_orientation(text_count, ocr_angle, ocr_confidence,
                       right_angle, right_confidence, right_abstained):
    if text_count > 0 and ocr_confidence >= 0.9:
        return {"source": "ocr", "degrees": correction(ocr_angle),
                "confidence": float(ocr_confidence)}
    residual = (float(right_angle) + 180) % 360 - 180
    half_turn = abs(residual) >= 135
    if not right_abstained and right_confidence >= (.92 if half_turn else .5):
        return {"source": "rightwayup", "degrees": correction(right_angle),
                "confidence": float(right_confidence)}
    return None

"""Choose a material direction from text, image content, then geometry."""

def choose_orientation(text_count, ocr_angle, ocr_confidence,
                       right_angle, right_confidence, right_abstained):
    if text_count > 0 and ocr_confidence >= 0.9:
        return {"source": "ocr", "degrees": -float(ocr_angle),
                "confidence": float(ocr_confidence)}
    if not right_abstained and right_confidence >= 0.5:
        return {"source": "rightwayup", "degrees": -float(right_angle),
                "confidence": float(right_confidence)}
    return None

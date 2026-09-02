"""
HYDAC Spec-to-3D Generator — PDF Parser
Atomic, testable module: one file type only.
Uses pdfplumber for precise table + text extraction.
"""

import re
from typing import Optional


def parse_pdf(file_path: str, filename: str) -> dict:
    """
    Parse a PDF file, extracting text and tables per page.

    Returns:
        {
            "raw_text": str,
            "tables": [{"table_index": int, "source_location": str, "headers": [...], "rows": [[...]]}],
            "pages": [{"page_num": int, "text": str, "tables": [...]}]
        }
    """
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber is required for PDF parsing. Install: pip install pdfplumber")

    result = {
        "raw_text": "",
        "tables": [],
        "pages": [],
        "ocr_flag": False,
    }

    table_index = 0

    with pdfplumber.open(file_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            page_data = {
                "page_num": page_num,
                "text": "",
                "tables": [],
                "is_ocr": False,
            }

            # Extract text
            page_text = page.extract_text() or ""
            page_data["text"] = page_text
            page_data["width"] = float(page.width) if page.width else 612.0
            page_data["height"] = float(page.height) if page.height else 792.0
            result["raw_text"] += f"\n--- Page {page_num} ---\n{page_text}"

            # Extract words with bounding boxes for visual citation overlay
            try:
                raw_words = page.extract_words() or []
                page_data["words"] = [
                    {
                        "text": w["text"],
                        "x0": round(float(w["x0"]), 2),
                        "top": round(float(w["top"]), 2),
                        "x1": round(float(w["x1"]), 2),
                        "bottom": round(float(w["bottom"]), 2)
                    }
                    for w in raw_words
                ]
            except Exception:
                page_data["words"] = []

            # Detect scanned/image-only pages (low text content)
            if _is_likely_scanned(page_text, page):
                page_data["is_ocr"] = True
                result["ocr_flag"] = True
                ocr_success = False

                # Strategy 1: Try easyocr
                try:
                    import easyocr
                    import numpy as np
                    
                    page_img = page.to_image(resolution=200)
                    img_np = np.array(page_img.original)
                    
                    if not hasattr(parse_pdf, "reader"):
                        parse_pdf.reader = easyocr.Reader(['en'], gpu=False)
                        
                    ocr_result = parse_pdf.reader.readtext(img_np, detail=0)
                    ocr_text = "\n".join(ocr_result)
                    
                    if ocr_text.strip():
                        page_text = ocr_text
                        page_data["text"] = page_text
                        result["raw_text"] += f"\n--- Page {page_num} (OCR-derived) ---\n{page_text}"
                        ocr_success = True
                except Exception:
                    pass

                # Strategy 2: Try pytesseract as fallback
                if not ocr_success:
                    try:
                        import pytesseract
                        page_img = page.to_image(resolution=200).original
                        ocr_text = pytesseract.image_to_string(page_img)
                        if ocr_text.strip():
                            page_text = ocr_text
                            page_data["text"] = page_text
                            result["raw_text"] += f"\n--- Page {page_num} (OCR-derived) ---\n{page_text}"
                            ocr_success = True
                    except Exception:
                        pass

                if not ocr_success:
                    page_data["text"] = f"[SCANNED PAGE - OCR-derived / fallback] {page_text}"

            # Extract tables
            tables = page.extract_tables() or []
            for table_data in tables:
                if not table_data or len(table_data) < 2:
                    continue

                # First row as headers, rest as data
                headers = [str(cell).strip() if cell else "" for cell in table_data[0]]
                rows = []
                for row in table_data[1:]:
                    cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                    rows.append(cleaned_row)

                table_entry = {
                    "table_index": table_index,
                    "source_location": f"Page {page_num}",
                    "headers": headers,
                    "rows": rows,
                }
                page_data["tables"].append(table_entry)
                result["tables"].append(table_entry)
                table_index += 1

            result["pages"].append(page_data)

    return result


def _is_likely_scanned(text: str, page) -> bool:
    """
    Heuristic: if a page has very little extracted text but has images/content,
    it's likely a scanned page requiring OCR.
    """
    clean_text = re.sub(r'\s+', '', text)
    # If less than 50 characters of actual text on a page, likely scanned
    if len(clean_text) < 50:
        # Check if page has content (dimensions suggest it's not blank)
        if page.width > 0 and page.height > 0:
            return True
    return False

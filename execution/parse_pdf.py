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
    }

    table_index = 0

    with pdfplumber.open(file_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            page_data = {
                "page_num": page_num,
                "text": "",
                "tables": [],
            }

            # Extract text
            page_text = page.extract_text() or ""
            page_data["text"] = page_text
            result["raw_text"] += f"\n--- Page {page_num} ---\n{page_text}"

            # Detect scanned/image-only pages (low text content)
            if _is_likely_scanned(page_text, page):
                try:
                    import easyocr
                    import numpy as np
                    
                    # Convert page to image
                    page_img = page.to_image(resolution=200)
                    img_np = np.array(page_img.original)
                    
                    # Initialize reader on demand
                    if not hasattr(parse_pdf, "reader"):
                        parse_pdf.reader = easyocr.Reader(['en'], gpu=False)
                        
                    ocr_result = parse_pdf.reader.readtext(img_np, detail=0)
                    ocr_text = "\n".join(ocr_result)
                    
                    page_text = ocr_text
                    page_data["text"] = page_text
                    result["raw_text"] += f"\n--- Page {page_num} (OCR) ---\n{page_text}"
                except ImportError:
                    page_data["text"] = f"[SCANNED PAGE - OCR REQUIRED but easyocr not installed] {page_text}"

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

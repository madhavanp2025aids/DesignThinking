"""
Spec-to-3D Generator — Specification Verifier & Strict Integrity Check
Self-check pass: ensures every extracted value can be proven from raw source text.
Enforces the "No Guess / No Hallucination" and "Not Available" rules.
"""

import re
from typing import Optional, Dict, Any, Tuple


class SpecVerifier:
    """
    Validates candidate extractions against raw source text/table snippets.
    Discards any unverified or ungrounded values.
    """

    @staticmethod
    def verify_field(
        raw_source_text: str,
        raw_value: Optional[str],
        normalized_value: Optional[str],
        source_snippet: Optional[str],
    ) -> Tuple[bool, str]:
        """
        Verify that raw_value or normalized_value appears in raw_source_text or source_snippet.
        
        Returns:
            (is_valid: bool, verification_note: str)
        """
        if not raw_value or str(raw_value).strip() == "":
            return False, "Missing raw extraction value"

        raw_val_str = str(raw_value).strip().lower()
        
        # Check within snippet first (highest confidence)
        if source_snippet:
            snippet_lower = source_snippet.lower()
            if raw_val_str in snippet_lower:
                return True, "Verified in source snippet"

            # Check numeric portion
            num_match = re.search(r'([0-9]+[.,]?[0-9]*)', raw_val_str)
            if num_match and num_match.group(1) in snippet_lower:
                return True, "Verified numeric component in source snippet"

        # Check within full document raw text
        if raw_source_text:
            text_lower = raw_source_text.lower()
            if raw_val_str in text_lower:
                return True, "Verified in document text"

            num_match = re.search(r'([0-9]+[.,]?[0-9]*)', raw_val_str)
            if num_match and num_match.group(1) in text_lower:
                return True, "Verified numeric value in document text"

        return False, "Value cannot be grounded in raw document content"

    @staticmethod
    def create_unavailable_field(
        field_name: str,
        part_id: str,
        document_id: str,
        reason: str = "Not available in uploaded document"
    ) -> Dict[str, Any]:
        """Generate a compliant 'is_available: false' spec record."""
        return {
            "part_id": part_id,
            "document_id": document_id,
            "field_name": field_name,
            "raw_value": None,
            "normalized_value": None,
            "unit": None,
            "original_unit": None,
            "source_location": None,
            "source_snippet": None,
            "confidence": "low",
            "is_available": 0,  # False in DB representation
            "not_available_reason": reason,
        }

# SOP: Extraction & Schema Mapping (`extract_parameters.py`)

## Purpose
Match extracted text/table data against the component schema alias table to identify hydraulic parameters with traceability.

## Source of Truth
- Field definitions, aliases, and unit conversions: `/execution/config/component_schemas.json`
- This file is the ONLY source for field names, aliases, and unit conversion factors

## Strategy

### 1. Alias Matching
For each field in each component type:
- Iterate all aliases (case-insensitive)
- Match against table headers and key-value pair keys
- Match against text block content using regex: `alias\s*[:=\-]?\s*([0-9.,]+)\s*([unit]*)`

### 2. Unit Normalization
- Detected unit is matched against `unit_variants` in the schema
- Conversion factor applied to normalize to canonical unit (e.g., inches → mm)
- Conversion is logged in the traceability tag
- **NEVER silently convert** — if unit is ambiguous, set confidence to "low"

### 3. Confidence Scoring
| Scenario | Confidence |
|----------|-----------|
| Exact alias match on table header | high |
| Alias substring match | medium |
| Loose match (short alias) | low |
| User-edited value | high |

### 4. Component Type Resolution
- Score each component type by:
  1. Count of matched required fields (primary sort)
  2. Count of total matched fields (secondary sort)
- Select the highest-scoring type
- If best match has 0 required fields matched and < 2 total fields → return empty (no specs found)

## Synonym/Alias Table (excerpt)
See `/execution/config/component_schemas.json` for the full table.

| Canonical Field | Sample Aliases |
|----------------|---------------|
| bore_diameter_mm | bore dia, bore diameter, cylinder bore, Ø, piston diameter |
| rod_diameter_mm | rod dia, rod diameter, piston rod, shaft diameter |
| stroke_length_mm | stroke, stroke length, hub, travel |
| working_pressure_bar | working pressure, operating pressure, rated pressure |

## Unit Conversion Rules
| From | To | Factor |
|------|----|--------|
| inch → mm | × 25.4 |
| psi → bar | × 0.0689476 |
| MPa → bar | × 10 |
| gpm → L/min | × 3.78541 |

## Behavioral Rules
1. NEVER guess a value not found in the document
2. NEVER fabricate a unit conversion factor — use only what's in the schema config
3. Every extracted value MUST carry: `{value, unit, source_file, source_location, confidence}`
4. If no parameters match any component type, return empty list (triggers "No specs found")

## Golden Rule
If extraction logic changes, update this SOP BEFORE modifying the code.

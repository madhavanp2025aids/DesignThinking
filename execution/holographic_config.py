"""
Spec-to-3D Generator — JARVIS / Holographic Presentation Config Generator
Generates presentation metadata, shader parameters, HUD markers, and animation hooks
for the futuristic holographic 3D viewer (purely visual layer, never distorts geometry).
"""

from typing import Dict, Any, List


def generate_holographic_config(
    template_used: str,
    parameters: Dict[str, Any],
    hud_anchors: List[Dict[str, Any]],
    is_placeholder: bool = False
) -> Dict[str, Any]:
    """
    Produce a complete holographic presentation configuration bundle.
    """
    # Color palette (JARVIS Cyan / Holographic Blue)
    primary_color = "#00f0ff" if not is_placeholder else "#ff3366"
    emissive_color = "#0077ff" if not is_placeholder else "#ff0033"
    glow_color = "#00e5ff" if not is_placeholder else "#ff6699"

    # Material Shader Definition
    material_config = {
        "type": "MeshPhysicalMaterial",
        "color": primary_color,
        "emissive": emissive_color,
        "emissive_intensity": 0.85 if not is_placeholder else 1.2,
        "roughness": 0.15,
        "metalness": 0.85,
        "transmission": 0.65,
        "ior": 1.45,
        "opacity": 0.80 if not is_placeholder else 0.50,
        "transparent": True,
        "wireframe": is_placeholder,
        "fresnel_glow": {
            "enabled": True,
            "color": glow_color,
            "power": 2.2,
            "intensity": 1.4
        },
        "scanline_effect": {
            "enabled": True,
            "frequency": 80.0,
            "speed": 1.6,
            "opacity": 0.25
        }
    }

    # Assembly / Reveal Animation
    reveal_animation = {
        "type": "wireframe_scan" if not is_placeholder else "glitch_pulse",
        "duration_seconds": 2.2,
        "scan_axis": "z",
        "particle_count": 400,
        "particle_color": glow_color,
        "sound_cue": "hologram_reveal.wav"
    }

    # Idle Dynamic Animation
    idle_animation = {
        "auto_rotate": True,
        "rotation_speed_y": 0.004,
        "rotation_speed_x": 0.001,
        "ambient_pulse": {
            "enabled": True,
            "frequency_hz": 1.2,
            "amplitude": 0.08
        }
    }

    # 3D HUD Annotation Markers linked to source specs
    formatted_hud_nodes = []
    for anchor in hud_anchors:
        field_info = anchor.get("field", {})
        raw_val = field_info.get("raw_value") or "N/A"
        unit = field_info.get("unit") or ""
        source_loc = field_info.get("source_location") or "Document"
        snippet = field_info.get("source_snippet") or ""

        formatted_hud_nodes.append({
            "id": f"hud-{anchor.get('name', 'dim').lower().replace(' ', '-')}",
            "label": anchor.get("name"),
            "display_value": f"{raw_val} {unit}".strip(),
            "position_3d": anchor.get("pos", [0, 0, 0]),
            "source_location": source_loc,
            "source_snippet": snippet,
            "field_id": field_info.get("field_id"),
            "highlight_color": "#ffffff"
        })

    # Interactive Inspection Nodes
    interactive_config = {
        "orbit_controls": {
            "enable_zoom": True,
            "enable_pan": True,
            "enable_rotate": True,
            "auto_rotate": True,
            "auto_rotate_speed": 1.0,
            "max_distance": 1500,
            "min_distance": 10
        },
        "click_to_inspect": True,
        "inspect_highlight_emissive": "#ffff00",
        "hud_nodes": formatted_hud_nodes
    }

    return {
        "cinematic_mode_default": True,
        "theme": "JARVIS_HOLOGRAPHIC",
        "material": material_config,
        "reveal_animation": reveal_animation,
        "idle_animation": idle_animation,
        "interaction": interactive_config,
        "status_badge": "VERIFIED_GEOMETRY" if not is_placeholder else "INCOMPLETE_SPEC_PLACEHOLDER"
    }

from typing import Any


def get_all_best_assets(_assets: Any) -> dict[str, Any]:
    # Replace with your actual implementation of getAllBestAssets
    return {}


def build_character_full_spec(character: dict[str, Any]) -> str:
    # Safe object properties retrieval to handle varying dynamic types
    physical_traits = character.get("physicalTraits", {})
    state = character.get("state")

    # const assets = ('assets' in character) ? getAllBestAssets(character.assets) : {};
    assets = get_all_best_assets(character.get("assets")) if "assets" in character else {}

    # Equivalent to: assets?.["description"]?.data || character.description
    assets_desc = assets.get("description", {}) if assets else {}
    assets_desc_data = assets_desc.get("data") if assets_desc else None

    character_description = assets_desc_data or (character.get("description", "") if "description" in character else "")

    # Gender evaluation string mapping
    gender_trait = physical_traits.get("gender")
    if gender_trait == "male":
        gender = "man"
    elif gender_trait == "female":
        gender = "woman"
    else:
        gender = "non-binary-gender person"

    # Handle lists conversion and string joins securely
    clothing_list = physical_traits.get("clothing", [])
    clothing = ", ".join(clothing_list) if clothing_list and len(clothing_list) > 0 else None

    accessories_list = physical_traits.get("accessories", [])
    accessories = ", ".join(accessories_list) if accessories_list and len(accessories_list) > 0 else None

    distinctive_features_list = physical_traits.get("distinctiveFeatures", [])
    distinctive_features = (
        "; ".join(distinctive_features_list)
        if distinctive_features_list and len(distinctive_features_list) > 0
        else None
    )

    appearance_notes_list = physical_traits.get("appearanceNotes", [])
    appearance_notes = (
        " ".join(appearance_notes_list) if appearance_notes_list and len(appearance_notes_list) > 0 else None
    )

    # Replicating JavaScript array filtering [].filter(Boolean).join(" ")
    appearance_sentences_raw = [
        character_description,
        f"A {physical_traits.get('age')}-year-old "
        f"{physical_traits.get('ethnicity', '')} {gender} "
        f"with a {physical_traits.get('build')} build.",
        f"Their hair is {physical_traits.get('hair')}." if physical_traits.get("hair") else None,
        f"They are wearing {clothing}." if clothing else None,
        f"They are accessorized with {accessories}." if accessories else None,
        f"Distinctive features include {distinctive_features}." if distinctive_features else None,
        appearance_notes or None,
    ]
    appearance_sentences = " ".join([str(item) for item in appearance_sentences_raw if item])

    # Moisture Level IIFE (Immediately Invoked Function Expression) emulation
    moisture_level = "dry"
    if state:
        costume_condition = state.get("costumeCondition", {})
        costume_wet = costume_condition.get("wetness", "dry") if costume_condition else "dry"
        priority = ["drenched", "soaked", "heavy", "wet", "moderate", "damp", "slight", "dry"]

        found_level = next((level for level in priority if costume_wet == level), None)
        if found_level:
            moisture_level = found_level

    # Physical conditions parts assembly
    physical_condition_parts_raw = []
    if state:
        dirt_level = state.get("dirtLevel")
        if dirt_level and dirt_level != "clean":
            physical_condition_parts_raw.append(f"visibly {dirt_level.replace('_', ' ')}")
        if moisture_level != "dry":
            physical_condition_parts_raw.append(f"{moisture_level} with moisture")
    physical_condition_parts = [item for item in physical_condition_parts_raw if item]

    # Costume condition parts assembly
    costume_condition_parts_raw = []
    if state and state.get("costumeCondition"):
        cc = state.get("costumeCondition", {})
        tears = cc.get("tears", []) if cc else []
        stains = cc.get("stains", []) if cc else []
        damage = cc.get("damage", []) if cc else []

        if tears and len(tears) > 0:
            costume_condition_parts_raw.append(f"torn at the {' and '.join(tears)}")
        if stains and len(stains) > 0:
            costume_condition_parts_raw.append(f"stained with {' and '.join(stains)}")
        if damage and len(damage) > 0:
            costume_condition_parts_raw.append(f"damaged: {', '.join(damage)}")
    costume_condition_parts = [item for item in costume_condition_parts_raw if item]

    # Hair condition parts assembly
    hair_condition_parts_raw = []
    if state and state.get("hairCondition"):
        hc = state.get("hairCondition", {})
        messiness = hc.get("messiness") if hc else None
        wetness = hc.get("wetness") if hc else None

        if messiness and messiness != "pristine":
            hair_condition_parts_raw.append(f"{messiness} hair")
        if wetness and wetness != "dry":
            hair_condition_parts_raw.append(f"{wetness} hair")
    hair_condition_parts = [item for item in hair_condition_parts_raw if item]

    # Injury formatting logic
    injury_parts: list[str] = []
    if state and state.get("injuries"):
        injuries = state.get("injuries", [])
        injury_parts.extend(f"a {i.get('severity')} {i.get('type')} on their {i.get('location')}" for i in injuries)

    # Combine full state components array
    state_sentences_raw = []
    if state and state.get("emotionalState"):
        state_sentences_raw.append(f"Their expression conveys {state.get('emotionalState')}.")
    else:
        state_sentences_raw.append(None)

    state_sentences_raw.append(
        f"They are {', '.join(physical_condition_parts)}." if len(physical_condition_parts) > 0 else None
    )
    state_sentences_raw.append(
        f"Their clothing is {', '.join(costume_condition_parts)}." if len(costume_condition_parts) > 0 else None
    )
    state_sentences_raw.append(
        f"Their hair is {' and '.join(hair_condition_parts)}." if len(hair_condition_parts) > 0 else None
    )
    state_sentences_raw.append(f"They have {', '.join(injury_parts)}." if len(injury_parts) > 0 else None)

    state_sentences = " ".join([str(item) for item in state_sentences_raw if item])

    # Extract final asset character image string references
    image = ""
    if "assets" in character:
        best_assets = get_all_best_assets(character.get("assets"))
        char_img_asset = best_assets.get("character_image", {}) if best_assets else {}
        image = char_img_asset.get("data", "") if char_img_asset else ""

    # Final layout compilation using global filter rules
    final_output_raw = [
        appearance_sentences,
        state_sentences,
        f"Image: {image}" if image else "",
        f"Reference ID: {character.get('referenceId')}",
    ]

    return " ".join([str(item) for item in final_output_raw if item])

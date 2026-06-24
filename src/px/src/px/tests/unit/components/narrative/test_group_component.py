import base64

from px.components.narrative.group import (
    GroupComponent,
    _extract_image_data,
    _slugify,
)


class DummyDataObj:
    def __init__(self, data):
        self.data = data


def test_slugify_basic():
    assert _slugify("My Group") == "my_group"
    assert _slugify("  !!! ") == "unnamed"


def test_extract_image_data_variants():
    # bytes
    b = b"\x89PNG"
    img_bytes, img_data = _extract_image_data(b)
    assert img_bytes == b and img_data is None

    # data URL string
    url = "data:image/png;base64,Zm9v"
    img_bytes, img_data = _extract_image_data(url)
    assert img_bytes is None and img_data == url

    # dict wrapper
    payload = {"image": url}
    img_bytes, img_data = _extract_image_data(payload)
    assert img_data == url

    # list wrapping
    img_bytes, img_data = _extract_image_data([None, payload])
    assert img_data == url


def test_normalize_pieces_and_precedence():
    comp = GroupComponent()
    pieces = [
        {"type": "image", "name": "hat", "description": "A red hat", "image": "http://x"},
        {"type": "prop", "name": "sword", "description": "A sharp sword"},
    ]

    # inline custom_description wins
    pieces[0]["custom_description"] = "A green hat"
    resolved = comp._normalize_pieces(pieces, overrides={})
    hat = next(p for p in resolved if p["name"] == "hat")
    assert hat["description"] == "A green hat"
    assert hat["caption"] == "A green hat"

    # override wins when inline not present
    pieces[0].pop("custom_description")
    resolved = comp._normalize_pieces(pieces, overrides={"hat": "Blue hat"})
    hat = next(p for p in resolved if p["name"] == "hat")
    assert hat["description"] == "Blue hat"
    assert hat["caption"] == "Blue hat"

    # inherited used when neither present
    resolved = comp._normalize_pieces(pieces, overrides={})
    hat = next(p for p in resolved if p["name"] == "hat")
    assert hat["description"] == "A red hat"
    assert hat["caption"] == "A red hat"


def test_normalize_pieces_max_six():
    """At most MAX_GROUP_PIECES (6) pieces should be returned."""
    comp = GroupComponent()
    # Create 10 pieces (more than the max)
    pieces = [
        {"type": "image", "name": f"piece_{i}", "description": f"Desc {i}"}
        for i in range(10)
    ]
    resolved = comp._normalize_pieces(pieces, overrides={})
    assert len(resolved) == 6, f"Expected 6 pieces, got {len(resolved)}"
    # The first 6 should be kept
    assert resolved[0]["name"] == "piece_0"
    assert resolved[5]["name"] == "piece_5"


def test_normalize_pieces_caption_field():
    """Each resolved piece should have a 'caption' field matching description."""
    comp = GroupComponent()
    pieces = [
        {"type": "image", "name": "hat", "description": "A red hat", "image": "http://x"},
    ]
    resolved = comp._normalize_pieces(pieces, overrides={})
    assert "caption" in resolved[0]
    assert resolved[0]["caption"] == resolved[0]["description"] == "A red hat"

    # Override should set caption
    resolved = comp._normalize_pieces(pieces, overrides={"hat": "A blue hat"})
    assert resolved[0]["caption"] == "A blue hat"
    assert resolved[0]["description"] == "A blue hat"


def test_coerce_piece_with_data_like():
    comp = GroupComponent()
    dd = DummyDataObj({"type": "image", "name": "photo", "description": "desc"})
    coerced = comp._coerce_piece(dd)
    assert isinstance(coerced, dict) and coerced["name"] == "photo"


def test_to_storable_and_prompt_builder():
    comp = GroupComponent()
    # to_storable: bytes
    data_uri, b = comp._to_storable(b"abc", None)
    assert data_uri == "pending" and b == b"abc"

    # to_storable: data URL -> bytes
    payload = b"hello"
    data_url = "data:image/png;base64," + base64.b64encode(payload).decode("ascii")
    data_uri, b = comp._to_storable(None, data_url)
    assert data_uri == "pending" and b == payload

    # prompt builder
    pieces = [
        {"type": "image", "name": "hat", "description": "A red hat", "caption": "A red hat", "image": "http://x"},
        {"type": "prop", "name": "sword", "description": "A sharp sword", "caption": "A sharp sword", "image": None},
    ]
    prompt = comp._build_prompt("Outfits", "Collection of wearable items", pieces)
    assert "Group: Outfits" in prompt
    assert "[1] hat (image)" in prompt
    assert "Caption: A red hat" in prompt
    assert "attached reference" in prompt
    assert "[2] sword (prop)" in prompt
    assert "Image: none" in prompt

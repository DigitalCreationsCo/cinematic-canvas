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
    assert any(p["name"] == "hat" and p["description"] == "A green hat" for p in resolved)

    # override wins when inline not present
    pieces[0].pop("custom_description")
    resolved = comp._normalize_pieces(pieces, overrides={"hat": "Blue hat"})
    assert any(p["name"] == "hat" and p["description"] == "Blue hat" for p in resolved)

    # inherited used when neither present
    resolved = comp._normalize_pieces(pieces, overrides={})
    assert any(p["name"] == "hat" and p["description"] == "A red hat" for p in resolved)


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
        {"type": "image", "name": "hat", "description": "A red hat"},
        {"type": "prop", "name": "sword", "description": "A sharp sword"},
    ]
    prompt = comp._build_prompt("Outfits", "Collection of wearable items", pieces)
    assert "Group: Outfits" in prompt
    assert "- hat: A red hat" in prompt

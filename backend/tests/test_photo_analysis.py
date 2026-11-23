import asyncio
import json
from io import BytesIO

import httpx
import pytest
from openai import AsyncOpenAI
from PIL import Image
from pydantic import ValidationError

from fridgellio.errors import ApiError
from fridgellio.photos import analyze_grocery_photo, analyze_receipt, image_data_url
from fridgellio.schemas import PhotoSuggestion


def photo_bytes(image_format="JPEG", size=(12, 8)):
    output = BytesIO()
    Image.new("RGB", size, "white").save(output, format=image_format)
    return output.getvalue()


def test_sends_validated_image_and_returns_structured_suggestions():
    def respond(request):
        body = json.loads(request.content)
        assert body["model"] == "gpt-5-mini"
        assert body["store"] is False
        content = body["input"][0]["content"]
        assert content[1]["type"] == "input_image"
        assert content[1]["image_url"].startswith("data:image/jpeg;base64,")
        assert body["text"]["format"]["type"] == "json_schema"
        result = {
            "suggestions": [
                {
                    "name": {"en": "Chicken eggs", "th": "ไข่ไก่"},
                    "quantity": "6",
                    "unit": "each",
                    "expiry_date": None,
                }
            ]
        }
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": json.dumps(result), "annotations": []}
                        ],
                    }
                ]
            },
        )

    async def check():
        async with AsyncOpenAI(
            api_key="test",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        ) as client:
            result = await analyze_grocery_photo(client, photo_bytes())
        suggestion = result.suggestions[0]
        assert suggestion.name.en == "Chicken eggs"
        assert suggestion.name.th == "ไข่ไก่"
        assert str(suggestion.quantity) == "6"
        assert suggestion.unit == "each"
        assert suggestion.expiry_date is None

    asyncio.run(check())


def test_accepts_empty_photo_result():
    def respond(request):
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": '{"suggestions":[]}',
                                "annotations": [],
                            }
                        ],
                    }
                ]
            },
        )

    async def check():
        async with AsyncOpenAI(
            api_key="test",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        ) as client:
            assert (await analyze_grocery_photo(client, photo_bytes())).suggestions == []

    asyncio.run(check())


def test_rejects_invalid_or_oversized_images():
    with pytest.raises(ApiError) as invalid:
        image_data_url(b"not an image")
    assert (invalid.value.status_code, invalid.value.code) == (422, "invalid_photo")

    with pytest.raises(ApiError) as large:
        image_data_url(photo_bytes("PNG", (4001, 4000)))
    assert (large.value.status_code, large.value.code) == (422, "photo_dimensions")


@pytest.mark.parametrize(
    "measurement",
    [
        {"quantity": "1", "unit": None},
        {"quantity": None, "unit": "each"},
        {"quantity": "1.5", "unit": "each"},
        {"quantity": "0", "unit": "g"},
    ],
)
def test_rejects_incomplete_or_invalid_measurements(measurement):
    with pytest.raises(ValidationError):
        PhotoSuggestion.model_validate(
            {
                "name": {"en": "Eggs", "th": "ไข่"},
                "expiry_date": None,
                **measurement,
            }
        )


@pytest.mark.parametrize(
    ("currency", "saved_price"), [("THB", "76.00"), ("other", None), ("unknown", None)]
)
def test_reads_receipt_with_quantity_and_line_price(currency, saved_price):
    def respond(request):
        body = json.loads(request.content)
        assert body["model"] == "gpt-5-mini" and body["store"] is False
        assert body["input"][0]["content"][1]["detail"] == "high"
        schema = body["text"]["format"]["schema"]
        fields = schema["$defs"]["ReceiptSuggestion"]["properties"]
        assert "printed_name" in fields and "price" in fields and "expiry_date" not in fields
        row = {
            "name": {"en": "Milk", "th": "นม"},
            "printed_name": "MILK 1L",
            "price": "76.00",
            "quantity": "2",
            "unit": "l",
        }
        result = {"currency": currency, "suggestions": [row] * 41, "has_more": False}
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": json.dumps(result), "annotations": []}
                        ],
                    }
                ]
            },
        )

    async def check():
        async with AsyncOpenAI(
            api_key="test", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))
        ) as client:
            result = await analyze_receipt(client, photo_bytes())
        assert result.has_more and len(result.suggestions) == 40
        assert result.suggestions[0].model_dump(mode="json") == {
            "name": {"en": "Milk", "th": "นม"},
            "printed_name": "MILK 1L",
            "price": saved_price,
            "quantity": "2",
            "unit": "l",
        }

    asyncio.run(check())

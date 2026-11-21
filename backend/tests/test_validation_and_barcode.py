import asyncio
import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import Response
from openai import AsyncOpenAI
from pydantic import ValidationError

from fridgellio.barcodes import FIELDS, lookup_barcode
from fridgellio.errors import ApiError
from fridgellio.routes import barcode
from fridgellio.schemas import StockCreate, expiry_status

VALID_STOCK = {"name": "Spinach", "quantity": "0.15", "unit": "kg", "location": "fridge"}


@pytest.mark.parametrize(
    "overrides",
    [
        {"quantity": "0"},
        {"quantity": "1.5", "unit": "each"},
        {"quantity": "0.0000001"},
        {"quantity": 0.15},
        {"quantity": "NaN"},
        {"expiry_date": "2026-02-30"},
        {"expiry_date": "1781049600"},
        {"name": "  "},
        {"location": "cupboard"},
        {"account_id": "unknown"},
    ],
)
def test_stock_validation(overrides):
    with pytest.raises(ValidationError):
        StockCreate.model_validate(VALID_STOCK | overrides)


def test_expiry_boundaries_and_exact_quantity():
    assert str(StockCreate.model_validate(VALID_STOCK).quantity) == "0.15"
    today = date(2026, 6, 10)
    dates = [date(2026, 6, day) for day in (9, 10, 11, 13, 14)]
    assert [expiry_status(expiry, today) for expiry in [*dates, None]] == [
        "past_date",
        "due_today",
        "use_soon",
        "use_soon",
        "later",
        "no_date",
    ]


@pytest.mark.parametrize(
    ("quantity", "normalized_quantity", "unit", "expected_size"),
    [
        ("500 g", None, None, (500, "g")),
        (None, 185, "g", (185, "g")),
        (None, "250", "ml", (250, "ml")),
        (None, "185", None, (None, None)),
        (None, None, None, (None, None)),
    ],
)
def test_barcode_request_and_localization(quantity, normalized_quantity, unit, expected_size):
    def respond(request):
        assert request.url.path == "/api/v3/product/0881234567890"
        assert dict(request.url.params) == {"cc": "th", "lc": "th", "fields": FIELDS}
        assert request.headers["User-Agent"].startswith("Fridgellio/")
        return httpx.Response(
            200,
            json={
                "product": {
                    "code": "0881234567890",
                    "product_name": "Rice",
                    "product_name_en": "Jasmine rice",
                    "product_name_th": "ข้าวหอมมะลิ",
                    "brands": "Test Brand",
                    "quantity": quantity,
                    "product_quantity": normalized_quantity,
                    "product_quantity_unit": unit,
                }
            },
        )

    async def check():
        async with httpx.AsyncClient(
            base_url="https://world.openfoodfacts.org",
            headers={"User-Agent": "Fridgellio/test"},
            transport=httpx.MockTransport(respond),
        ) as client:
            result = await lookup_barcode(client, "0881234567890", "th")
            assert result.name == "ข้าวหอมมะลิ"
            assert result.name_en == "Jasmine rice"
            assert (result.quantity, result.unit) == expected_size
            assert result.model_dump(by_alias=True)["Quantity"] == expected_size[0]

    asyncio.run(check())


@pytest.mark.parametrize(
    ("upstream_status", "code", "status"),
    [
        (404, "product_not_found", 404),
        (429, "barcode_rate_limited", 503),
        (500, "barcode_unavailable", 502),
    ],
)
def test_barcode_failure(upstream_status, code, status):
    async def check():
        async with httpx.AsyncClient(
            base_url="https://world.openfoodfacts.org",
            transport=httpx.MockTransport(lambda _: httpx.Response(upstream_status)),
        ) as client:
            with pytest.raises(ApiError) as error:
                await lookup_barcode(client, "0881234567890", "en")
            assert (error.value.code, error.value.status_code) == (code, status)

    asyncio.run(check())


@pytest.mark.parametrize("matches", [True, False])
def test_barcode_web_search_first(matches):
    code = "0881234567890"
    source = "https://example.com/rice"

    def respond(request):
        body = json.loads(request.content)
        assert body["tools"] == [{"type": "web_search"}]
        assert body["tool_choice"] == "required"
        assert code in body["input"]
        product = {
            "code": code if matches else "9999",
            "name": "Jasmine rice",
            "name_en": "Jasmine rice",
            "name_th": None,
            "brands": "Web Brand",
            "quantity": 500,
            "unit": "g",
            "source_url": source,
        }
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps({"product": product}),
                                "annotations": [{"type": "url_citation", "url": source}],
                            }
                        ],
                    }
                ]
            },
        )

    def fallback(request):
        assert not matches
        assert request.url.path.endswith(code)
        return httpx.Response(
            200, json={"product": {"name": "Rice", "brands": "OFF Brand", "product_name": "Rice"}}
        )

    async def check():
        async with (
            AsyncOpenAI(
                api_key="test",
                http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
            ) as openai,
            httpx.AsyncClient(
                base_url="https://world.openfoodfacts.org", transport=httpx.MockTransport(fallback)
            ) as off,
        ):
            request = SimpleNamespace(
                app=SimpleNamespace(state=SimpleNamespace(openai_client=openai, barcode_client=off))
            )
            response = Response()
            result = await barcode(
                code, request, response, SimpleNamespace(language="en", id=1), AsyncMock()
            )
            assert result.brands == ("Web Brand" if matches else "OFF Brand")
            assert response.headers.get("X-Barcode-Source") == (source if matches else None)

    asyncio.run(check())


@pytest.mark.parametrize(
    ("language", "name"),
    [
        ("th", "นอติลุส ทูน่าสเต็กในน้ำมันถั่วเหลือง"),
        ("en", "Nautilus Tuna Steak in Soybean Oil"),
    ],
)
def test_verified_nautilus_barcode(language, name):
    async def check():
        response = Response()
        result = await barcode(
            "8850229100010",
            SimpleNamespace(),
            response,
            SimpleNamespace(language=language),
            AsyncMock(),
        )
        assert result.model_dump(by_alias=True) == {
            "code": "8850229100010",
            "name": name,
            "name_en": "Nautilus Tuna Steak in Soybean Oil",
            "name_th": "นอติลุส ทูน่าสเต็กในน้ำมันถั่วเหลือง",
            "brands": "Nautilus",
            "Quantity": 170.0,
            "Unit": "g",
        }
        assert response.headers["X-Barcode-Source"].endswith("8850229100010")

    asyncio.run(check())

import asyncio
from datetime import date

import httpx
import pytest
from pydantic import ValidationError

from fridgellio.barcodes import FIELDS, lookup_barcode
from fridgellio.errors import ApiError
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


def test_barcode_request_and_localization():
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
                    "quantity": "500 g",
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
            assert result.package_size == "500 g"

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

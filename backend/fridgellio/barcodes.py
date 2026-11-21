import re
from typing import BinaryIO

import httpx
import zxingcpp
from PIL import Image
from pydantic import BaseModel, ValidationError

from .errors import ApiError
from .schemas import BarcodeView, Language

OPEN_FOOD_FACTS_BASE_URL = "https://world.openfoodfacts.org"
FIELDS = "code,product_name,product_name_th,product_name_en,brands,quantity"
BARCODE_PATTERN = r"^[0-9]{4,24}$"
MAX_PHOTO_PIXELS = 16_000_000


class Product(BaseModel):
    code: str | None = None
    product_name: str | None = None
    product_name_th: str | None = None
    product_name_en: str | None = None
    brands: str | None = None
    quantity: str | None = None


class ProductLookup(BaseModel):
    product: Product | None = None


def clean(value: str | None) -> str | None:
    return (value.strip() or None) if value is not None else None


def barcode_digits(barcode: zxingcpp.Barcode) -> str:
    if barcode.format == zxingcpp.BarcodeFormat.UPCE and barcode.extra:
        return barcode.extra.get("UPCE", barcode.text)
    if barcode.format == zxingcpp.BarcodeFormat.EAN13 and barcode.text.startswith("0"):
        # UPC-A and zero-prefixed EAN-13 have identical bars. Return the UPC-A digits.
        return barcode.text[1:]
    return barcode.text


def decode_barcode(photo: BinaryIO) -> str:
    try:
        with Image.open(photo, formats=("JPEG", "PNG", "WEBP")) as image:
            if image.width * image.height > MAX_PHOTO_PIXELS:
                raise Image.DecompressionBombError
            grayscale = image.convert("L")
    except Image.DecompressionBombError:
        raise ApiError(
            422, "barcode_photo_dimensions", "Use a photo with at most 16 megapixels."
        ) from None
    except (OSError, SyntaxError, ValueError):
        raise ApiError(
            422, "invalid_barcode_photo", "Upload a valid JPEG, PNG, or WebP image."
        ) from None

    with grayscale:
        barcodes = zxingcpp.read_barcodes(grayscale, text_mode=zxingcpp.TextMode.Plain)
    digits = (barcode_digits(barcode) for barcode in barcodes)
    codes = {code for code in digits if re.fullmatch(BARCODE_PATTERN, code)}
    if not codes:
        raise ApiError(404, "barcode_not_found", "No numeric barcode was found in the photo.")
    if len(codes) > 1:
        raise ApiError(422, "multiple_barcodes", "Upload a photo showing one barcode.")
    return codes.pop()


async def lookup_barcode(client: httpx.AsyncClient, code: str, language: Language) -> BarcodeView:
    try:
        response = await client.get(
            f"/api/v3/product/{code}",
            params={"cc": "th", "lc": language, "fields": FIELDS},
        )
    except httpx.TimeoutException:
        raise ApiError(504, "barcode_timeout", "The barcode lookup timed out.") from None
    except httpx.RequestError:
        raise ApiError(
            502, "barcode_unavailable", "Barcode lookup is temporarily unavailable."
        ) from None

    if response.status_code in {302, 404}:
        raise ApiError(404, "product_not_found", "No food product matches this barcode.")
    if response.status_code == 429:
        raise ApiError(503, "barcode_rate_limited", "Barcode lookup is busy. Try again shortly.")
    if not response.is_success:
        raise ApiError(502, "barcode_unavailable", "Barcode lookup is temporarily unavailable.")

    try:
        lookup = ProductLookup.model_validate_json(response.content)
    except ValidationError:
        raise ApiError(
            502, "barcode_invalid_response", "The product lookup returned invalid data."
        ) from None
    if lookup.product is None:
        raise ApiError(404, "product_not_found", "No food product matches this barcode.")

    product = lookup.product
    english = clean(product.product_name_en)
    thai = clean(product.product_name_th)
    preferred = thai if language == "th" else english
    return BarcodeView(
        code=clean(product.code) or code,
        name=preferred or clean(product.product_name) or english or thai,
        name_en=english,
        name_th=thai,
        brands=clean(product.brands),
        package_size=clean(product.quantity),
    )

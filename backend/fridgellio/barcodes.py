import httpx
from pydantic import BaseModel, ValidationError

from .errors import ApiError
from .schemas import BarcodeView, Language

OPEN_FOOD_FACTS_BASE_URL = "https://world.openfoodfacts.org"
FIELDS = "code,product_name,product_name_th,product_name_en,brands,quantity"


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

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import zxingcpp
from fastapi.testclient import TestClient
from PIL import Image

from fridgellio.config import Settings
from fridgellio.data import current_account, db_session
from fridgellio.main import create_app

DECODE = "/api/barcodes/decode"


@pytest.fixture
def client():
    app = create_app(Settings(_env_file=None, database_url=None, openai_api_key=None))

    async def session():
        yield SimpleNamespace(rollback=AsyncMock())

    app.dependency_overrides[current_account] = lambda: None
    app.dependency_overrides[db_session] = session
    with TestClient(app) as test_client:
        yield test_client


def barcode_image(value, symbology):
    barcode = zxingcpp.create_barcode(value, symbology)
    return Image.fromarray(barcode.to_image(scale=4))


def upload(image, image_format="PNG"):
    with BytesIO() as photo:
        image.save(photo, format=image_format)
        return {"photo": ("camera." + image_format.lower(), photo.getvalue())}


@pytest.mark.parametrize(
    ("digits", "symbology", "image_format"),
    [
        ("8851234567898", zxingcpp.BarcodeFormat.EAN13, "JPEG"),
        ("012345678905", zxingcpp.BarcodeFormat.UPCA, "PNG"),
        ("01234565", zxingcpp.BarcodeFormat.UPCE, "WEBP"),
        ("00123456", zxingcpp.BarcodeFormat.Code128, "PNG"),
        ("00123456", zxingcpp.BarcodeFormat.QRCode, "PNG"),
    ],
)
def test_returns_only_barcode_digits(client, digits, symbology, image_format):
    response = client.post(DECODE, files=upload(barcode_image(digits, symbology), image_format))
    assert response.status_code == 200, response.text
    assert response.json() == digits


def test_rejects_image_with_multiple_distinct_barcodes(client):
    top = barcode_image("00123456", zxingcpp.BarcodeFormat.Code128)
    bottom = barcode_image("00987654", zxingcpp.BarcodeFormat.Code128)
    image = Image.new("L", (max(top.width, bottom.width), top.height + bottom.height + 40), 255)
    image.paste(top, (0, 0))
    image.paste(bottom, (0, top.height + 40))

    response = client.post(DECODE, files=upload(image))
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "multiple_barcodes"


def test_rejects_image_without_a_numeric_barcode(client):
    image = barcode_image("https://example.com/product", zxingcpp.BarcodeFormat.QRCode)
    response = client.post(DECODE, files=upload(image))
    assert response.status_code == 404, response.text
    assert response.json()["code"] == "barcode_not_found"


def test_rejects_invalid_camera_upload(client):
    response = client.post(DECODE, files={"photo": ("camera.png", b"invalid", "image/png")})
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "invalid_barcode_photo"


def test_limits_camera_upload_size(client):
    response = client.post(DECODE, files={"photo": ("large.png", b"0" * (8 * 1024 * 1024))})
    assert response.status_code == 413, response.text


def test_limits_camera_image_dimensions(client):
    response = client.post(DECODE, files=upload(Image.new("1", (4001, 4000))))
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "barcode_photo_dimensions"


def test_decode_requires_authentication():
    app = create_app(Settings(_env_file=None, database_url=None, openai_api_key=None))
    with TestClient(app) as client:
        response = client.post(DECODE, files=upload(Image.new("L", (32, 32), 255)))

    assert response.status_code == 401, response.text

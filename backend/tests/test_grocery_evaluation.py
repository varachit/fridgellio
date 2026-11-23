import asyncio
import json
from pathlib import Path

from fridgellio.evaluate_intake import ReceiptBasket, compare, errors
from fridgellio.schemas import PhotoSuggestion


def test_demo_and_wrong_date_release_gate(tmp_path):
    demo = Path(__file__).resolve().parents[1] / "evals/grocery-demo.json"
    assert asyncio.run(compare(demo, live=False))
    cases = json.loads(demo.read_text())
    cases[0]["candidate"] = cases[0]["baseline"]
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps(cases))
    assert not asyncio.run(compare(bad, live=False))


def test_equivalent_amounts_duplicate_predictions_and_partial_names():
    item = PhotoSuggestion.model_validate(
        {
            "name": {"en": "Rice", "th": "ข้าว"},
            "quantity": "1",
            "unit": "kg",
            "expiry_date": None,
        }
    )
    equivalent = PhotoSuggestion.model_validate(
        {
            **item.model_dump(),
            "quantity": "1000",
            "unit": "g",
        }
    )
    assert not +errors([item], [equivalent])
    different = PhotoSuggestion.model_validate(
        {
            **item.model_dump(),
            "name": {"en": "Rice", "th": "ผิด"},
            "quantity": None,
            "unit": None,
        }
    )
    assert +errors([item], [different]) == {"name_errors": 1, "missing_amount": 1}
    assert +errors([item], [different, equivalent]) == {"extra_items": 1}


def test_receipt_price_gate_and_printed_name_matching(tmp_path):
    demo = Path(__file__).resolve().parents[1] / "evals/receipt-demo.json"
    cases = json.loads(demo.read_text())
    case = cases[0]
    sample = ReceiptBasket.model_validate(case)
    assert +errors(sample.expected, sample.baseline) == {"printed_name_errors": 1, "name_errors": 4}
    case["candidate"] = case["expected"]
    manifest = tmp_path / "receipt.json"
    manifest.write_text(json.dumps(cases))
    assert asyncio.run(compare(manifest, live=False))
    case["candidate"] = [
        {**case["expected"][1], "price": "38.00", "name": {"en": "Milk carton", "th": "นมกล่อง"}},
        *case["expected"][::2],
    ]
    manifest.write_text(json.dumps(cases))
    assert not asyncio.run(compare(manifest, live=False))

"""Compare two grocery image extraction revisions against the same labeled baskets."""

import argparse
import asyncio
import json
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from typing import Literal
from unicodedata import normalize

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, TypeAdapter

from .config import Settings
from .photos import analyze_grocery_photo, analyze_receipt
from .recommendations import base_unit, unit_factor
from .schemas import GrocerySuggestion, PhotoSuggestion, ReceiptSuggestion


class Basket[T: GrocerySuggestion](BaseModel):
    case: str = Field(min_length=1)
    expected: list[T]
    baseline: list[T]
    candidate: list[T] | None = None
    image: Path | None = None


class PhotoBasket(Basket[PhotoSuggestion]):
    source: Literal["photo"] = "photo"


class ReceiptBasket(Basket[ReceiptSuggestion]):
    source: Literal["receipt"]


def names(item: GrocerySuggestion) -> tuple[str, str]:
    return tuple(
        normalize("NFC", " ".join(n.casefold().split())) for n in (item.name.en, item.name.th)
    )


def measurement(item: GrocerySuggestion):
    if item.quantity is not None:
        return (item.quantity * unit_factor(item.unit), base_unit(item.unit))
    return None


def match_rank(item: GrocerySuggestion, gold: GrocerySuggestion) -> int:
    agreements = sum(a == b for a, b in zip(names(item), names(gold)))
    if isinstance(item, ReceiptSuggestion) and isinstance(gold, ReceiptSuggestion):
        left, right = item.printed_name.casefold(), gold.printed_name.casefold()
        if left == right:
            return 4
        # A stray OCR mark can obscure an otherwise identical bilingual description.
        left_digits = [c for c in left if c.isdigit()]
        right_digits = [c for c in right if c.isdigit()]
        if (
            not agreements
            and min(len(left), len(right)) >= 12
            and left_digits == right_digits
            and SequenceMatcher(None, left, right).ratio() >= 0.95
        ):
            return 1
    return agreements + 1 if agreements else 0


def errors[T: GrocerySuggestion](expected: list[T], suggestions: list[T]) -> Counter:
    remaining = list(expected)
    pending = list(suggestions)
    counts = Counter()
    for rank in (4, 3, 2, 1):
        for item in list(pending):
            matches = [gold for gold in remaining if match_rank(item, gold) == rank]
            if not matches or (rank == 1 and len(matches) != 1):
                continue
            match = matches[0]
            pending.remove(item)
            remaining.remove(match)
            counts["name_errors"] += sum(a != b for a, b in zip(names(item), names(match)))
            if measurement(item) != measurement(match):
                counts["missing_amount" if item.quantity is None else "wrong_amount"] += 1
            if isinstance(item, ReceiptSuggestion) and isinstance(match, ReceiptSuggestion):
                counts["printed_name_errors"] += item.printed_name != match.printed_name
                if item.price != match.price:
                    counts["missing_price" if item.price is None else "wrong_price"] += 1
            if (
                isinstance(item, PhotoSuggestion)
                and isinstance(match, PhotoSuggestion)
                and item.expiry_date != match.expiry_date
            ):
                counts["missing_date" if item.expiry_date is None else "wrong_date"] += 1
    counts["missed_items"] = len(remaining)
    counts["extra_items"] = len(pending)
    counts["wrong_date"] += sum(
        isinstance(item, PhotoSuggestion) and item.expiry_date is not None for item in pending
    )
    counts["wrong_price"] += sum(
        isinstance(item, ReceiptSuggestion) and item.price is not None for item in pending
    )
    counts["wrong_amount"] += sum(item.quantity is not None for item in pending)
    return counts


async def compare(path: Path, live: bool) -> bool:
    baskets = TypeAdapter(list[PhotoBasket | ReceiptBasket]).validate_json(path.read_bytes())
    if not baskets or len({b.case for b in baskets}) != len(baskets):
        raise ValueError("Supply at least one basket and a unique case ID for each.")
    if live and any(not b.image or not (path.parent / b.image).is_file() for b in baskets):
        raise ValueError("Every live case needs a readable image path relative to the manifest.")
    if not live and any(b.candidate is None for b in baskets):
        raise ValueError("Every offline case needs candidate predictions.")
    client = None
    if live:
        key = Settings().openai_api_key
        if not key:
            raise ValueError("Configure OPENAI_API_KEY for live evaluation.")
        client = AsyncOpenAI(api_key=key.get_secret_value())
    passed = True
    try:
        for basket in baskets:
            predictions = basket.candidate
            if client is not None:
                photo = (path.parent / basket.image).read_bytes()
                reader = analyze_receipt if basket.source == "receipt" else analyze_grocery_photo
                predictions = (await reader(client, photo)).suggestions
            baseline = errors(basket.expected, basket.baseline)
            candidate = errors(basket.expected, predictions)
            worsened = sorted(k for k in candidate if candidate[k] > baseline[k])
            passed &= (
                not worsened and candidate["wrong_date"] == 0 and candidate["wrong_price"] == 0
            )
            print(
                json.dumps(
                    {
                        "case": basket.case,
                        "baseline": baseline,
                        "candidate": candidate,
                        "regressions": worsened,
                    },
                    sort_keys=True,
                )
            )
    finally:
        if client is not None:
            await client.close()
    return passed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument(
        "--live-candidate",
        action="store_true",
        help="Send the manifest's chosen images to the configured photo model.",
    )
    args = parser.parse_args()
    raise SystemExit(0 if asyncio.run(compare(args.manifest, args.live_candidate)) else 1)

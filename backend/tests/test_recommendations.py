import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from fridgellio import recommendations
from fridgellio.errors import ApiError
from fridgellio.recommendations import (
    RecipeSuggestions,
    RecommendationPreview,
    validate_suggestions,
)


@pytest.mark.parametrize("encoded", ["dGVzdA==", None])
def test_recipe_image_returns_webp_or_reports_failure(monkeypatch, encoded):
    quota = AsyncMock(return_value=True)
    monkeypatch.setattr(recommendations, "take_attempt", quota)
    generate = AsyncMock(return_value=SimpleNamespace(data=[SimpleNamespace(b64_json=encoded)]))
    client = Mock()
    client.with_options.return_value.images.generate = generate
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(openai_client=client)))
    session = SimpleNamespace(commit=AsyncMock())

    async def generate_image():
        return await recommendations.recipe_image(
            recommendations.RecipeImageRequest(name="Rice bowl", ingredients=["Rice"]),
            SimpleNamespace(account_id="account"),
            session,
            request,
        )

    if encoded:
        assert asyncio.run(generate_image()).webp_base64 == encoded
        assert generate.await_args.kwargs["output_format"] == "webp"
        assert "Rice bowl" in generate.await_args.kwargs["prompt"]
    else:
        with pytest.raises(ApiError) as error:
            asyncio.run(generate_image())
        assert error.value.code == "recipe_image_unavailable"


def test_recommendations_discard_invalid_candidates_and_cap_at_five():
    preview = RecommendationPreview.model_validate(
        {
            "preferences": {
                "equipment": ["Stove"],
                "foods_to_avoid": [],
                "max_total_minutes": 15,
                "difficulty": "easy",
            },
            "ingredients": [
                {
                    "name": "Rice",
                    "name_en": "Rice",
                    "name_th": "ข้าว",
                    "quantity": "100",
                    "unit": "g",
                }
            ],
        }
    )
    sample = {
        "ingredients": [{"reference": 0, "quantity": "20"}],
        "equipment": ["Stove"],
        "steps": [{"en": "Warm the rice.", "th": "อุ่นข้าว"}],
        "minutes": 10,
        "difficulty": "easy",
    }
    candidates = [
        sample | {"equipment": ["Oven"]},
        sample | {"minutes": 16},
        sample | {"ingredients": [{"reference": 1, "quantity": "20"}]},
        sample | {"ingredients": [{"reference": 0, "quantity": "0"}]},
        *[sample for _ in range(6)],
    ]
    suggestions = RecipeSuggestions.model_validate(
        {
            "recipes": [
                candidate | {"name": {"en": f"Rice {index}", "th": f"ข้าว {index}"}}
                for index, candidate in enumerate(candidates)
            ]
        }
    )
    recipes = validate_suggestions(suggestions, preview, preview)
    assert [recipe.name.en for recipe in recipes] == [f"Rice {index}" for index in range(4, 9)]

    current = preview.model_copy(
        update={"ingredients": [preview.ingredients[0].model_copy(update={"quantity": 45})]}
    )
    assert len(validate_suggestions(suggestions, preview, current)) == 2

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: SecretStr | None = None
    docs_enabled: bool = True
    open_food_facts_user_agent: str = "Fridgellio/0.1"
    openai_api_key: SecretStr | None = None

    def postgres_url(self) -> URL | None:
        if self.database_url is None:
            return None
        try:
            url = make_url(self.database_url.get_secret_value())
            if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
                raise ValueError
        except (ArgumentError, ValueError):
            raise ValueError("DATABASE_URL must be a PostgreSQL connection URL") from None
        return url.set(drivername="postgresql+psycopg")

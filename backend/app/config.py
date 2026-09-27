from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_service_role_key: str = ""
    api_secret: str = "dev-only-change-me-to-a-long-secret"
    match_threshold: float = 0.363

    @property
    def model_dir(self) -> Path:
        return Path(__file__).resolve().parents[1] / "models"


settings = Settings()

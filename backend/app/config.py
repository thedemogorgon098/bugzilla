from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), extra="ignore")

    app_name: str = "NexusTrack"
    secret_key: str = "nexustrack-hackathon-dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    database_url: str = f"sqlite:///{(ROOT / 'nexustrack_v2.db').as_posix()}"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    github_webhook_secret: str = "nexustrack-github-secret"
    github_token: str = ""
    upload_dir: str = str(ROOT / "uploads")
    redis_url: str = "redis://localhost:6379/0"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

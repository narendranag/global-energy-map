"""Load API keys from ~/.config/secrets.env."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

SECRETS_PATH = Path.home() / ".config" / "secrets.env"

def load_secrets() -> None:
    if SECRETS_PATH.exists():
        load_dotenv(SECRETS_PATH)

def require(name: str) -> str:
    load_secrets()
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(
            f"Missing required secret {name}. Add it to {SECRETS_PATH}."
        )
    return val

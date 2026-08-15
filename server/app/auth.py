"""Passphrase gate.

This is a door lock, not authentication: one shared secret, no users, no
sessions. It exists so the public URL isn't world-readable and nobody else can
spend the Groq quota. Constant-time comparison, and the app refuses to start
without a key rather than silently serving wide open.
"""

from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status

from . import config


class MissingKeyError(RuntimeError):
    """Raised at startup when BJJ_KEY is unset."""

    def __init__(self) -> None:
        super().__init__(
            "BJJ_KEY is not set. Refusing to start without a passphrase — "
            "set it in the environment (locally) or with `fly secrets set`."
        )


def require_key(x_bjj_key: str = Header(default="")) -> None:
    """FastAPI dependency: reject any request without the passphrase."""
    if not config.BJJ_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server passphrase is not configured.",
        )
    if not secrets.compare_digest(x_bjj_key, config.BJJ_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing passphrase.",
        )

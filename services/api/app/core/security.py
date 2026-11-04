"""Hashing de contraseñas y tokens firmados.

El token es un JWT-like compacto (payload base64url + HMAC-SHA256) que se
valida en cada petición. En producción puede sustituirse por un proveedor
OIDC sin cambiar los contratos de la API.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from app.core.config import settings

PBKDF2_ITERATIONS = 210_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt.encode("ascii"), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_access_token(user_id: str, email: str, role: str) -> tuple[str, int]:
    expires_in = settings.token_hours * 3600
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(seconds=expires_in)).timestamp()),
        "jti": secrets.token_hex(8),
    }
    raw = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64(
        hmac.new(settings.secret.encode("utf-8"), raw.encode("ascii"), hashlib.sha256).digest()
    )
    return f"{raw}.{signature}", expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        raw, signature = token.split(".", 1)
        expected = _b64(
            hmac.new(
                settings.secret.encode("utf-8"), raw.encode("ascii"), hashlib.sha256
            ).digest()
        )
        if not hmac.compare_digest(signature, expected):
            raise ValueError("firma inválida")
        payload = json.loads(_unb64(raw))
        if int(payload["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("token vencido")
        if not payload.get("sub"):
            raise ValueError("token sin sujeto")
        return payload
    except Exception as exc:  # noqa: BLE001 - se convierte en 401 controlado
        raise HTTPException(
            status_code=401,
            detail="Sesión inválida o vencida. Inicia sesión nuevamente.",
        ) from exc

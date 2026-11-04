"""Limitador de tasa en memoria para endpoints sensibles.

En un despliegue con varios procesos debe sustituirse por Redis. Aquí
protege la demo y documenta el punto de extensión.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(request: Request, bucket: str, limit: int, window_seconds: int) -> None:
    client = request.client.host if request.client else "unknown"
    key = f"{bucket}:{client}"
    now = time.monotonic()
    with _lock:
        queue = _hits[key]
        while queue and queue[0] <= now - window_seconds:
            queue.popleft()
        if len(queue) >= limit:
            retry = max(1, int(window_seconds - (now - queue[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Demasiadas solicitudes. Intenta de nuevo en {retry} segundos.",
                headers={"Retry-After": str(retry)},
            )
        queue.append(now)


def reset_limits() -> None:
    with _lock:
        _hits.clear()

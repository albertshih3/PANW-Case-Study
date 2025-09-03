import os
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt


_jwks_cache: Optional[Dict[str, Any]] = None
_jwks_last_fetch: float = 0.0
_jwks_ttl_seconds = 600


def _get_issuer_and_jwks() -> tuple[str, str]:
    issuer = os.getenv("CLERK_ISSUER") or os.getenv("CLERK_JWT_ISSUER")
    jwks_url = os.getenv("CLERK_JWKS_URL")
    if not jwks_url:
        if not issuer:
            raise RuntimeError("CLERK_ISSUER or CLERK_JWKS_URL env var is required")
        jwks_url = issuer.rstrip("/") + "/.well-known/jwks.json"
    return issuer or "", jwks_url


async def _get_jwks() -> Dict[str, Any]:
    global _jwks_cache, _jwks_last_fetch
    now = time.time()
    if _jwks_cache and now - _jwks_last_fetch < _jwks_ttl_seconds:
        return _jwks_cache  # type: ignore[return-value]
    _, jwks_url = _get_issuer_and_jwks()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_last_fetch = now
        return _jwks_cache


security = HTTPBearer(auto_error=False)


async def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = credentials.credentials
    try:
        issuer, _ = _get_issuer_and_jwks()
        jwks = await _get_jwks()
        headers = jwt.get_unverified_header(token)
        kid = headers.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="Token missing kid")
        key = None
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break
        if key is None:
            # Refresh JWKS once if kid not found
            global _jwks_cache, _jwks_last_fetch
            _jwks_cache = None
            _jwks_last_fetch = 0.0
            jwks = await _get_jwks()
            for k in jwks.get("keys", []):
                if k.get("kid") == kid:
                    key = k
                    break
        if key is None:
            raise HTTPException(status_code=401, detail="Signing key not found")

        # Validate signature and claims; aud is optional depending on Clerk config
        options = {"verify_aud": False}
        claims = jwt.decode(token, key, algorithms=[key.get("alg", "RS256")], issuer=issuer or None, options=options)
        sub = claims.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid token claims")
        return sub
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")

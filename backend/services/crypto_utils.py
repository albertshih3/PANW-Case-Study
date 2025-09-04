import os
import base64
from typing import Optional
import importlib


def _get_master_secret() -> Optional[bytes]:
    secret = os.getenv("DATA_ENCRYPTION_SECRET")
    if not secret:
        # No secret configured; operate in plaintext for compatibility.
        return None
    return secret.encode("utf-8")


def _derive_key(user_id: str, master: bytes) -> bytes:
    """Derive a 256-bit key using HKDF-SHA256 with per-user salt."""
    try:
        hkdf_mod = importlib.import_module('cryptography.hazmat.primitives.kdf.hkdf')
        primitives = importlib.import_module('cryptography.hazmat.primitives')
        backends = importlib.import_module('cryptography.hazmat.backends')
    except Exception as e:
        raise RuntimeError("cryptography not available") from e

    salt = (user_id or "").encode("utf-8")
    HKDF = getattr(hkdf_mod, 'HKDF')
    hashes = getattr(primitives, 'hashes')
    default_backend = getattr(backends, 'default_backend')
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"keo-journal-v1",
        backend=default_backend(),
    )
    return hkdf.derive(master)


def encrypt_text_for_user(user_id: str, plaintext: Optional[str]) -> Optional[str]:
    if plaintext is None:
        return None
    master = _get_master_secret()
    if not master:
        # No encryption configured or crypto missing: store as-is
        return plaintext
    try:
        aead_mod = importlib.import_module('cryptography.hazmat.primitives.ciphers.aead')
        AESGCM = getattr(aead_mod, 'AESGCM')
        key = _derive_key(user_id, master)
        aes = AESGCM(key)
        import os as _os
        nonce = _os.urandom(12)
        ct = aes.encrypt(nonce, plaintext.encode("utf-8"), None)
        blob = b"KEO1" + nonce + ct  # prefix to identify ciphertext format
        return base64.b64encode(blob).decode("ascii")
    except Exception:
        # On failure, return plaintext to avoid data loss
        return plaintext


def decrypt_text_for_user(user_id: str, ciphertext_b64: Optional[str]) -> Optional[str]:
    if ciphertext_b64 is None:
        return None
    master = _get_master_secret()
    if not master:
        # Not encrypted (or crypto unavailable); return as-is
        return ciphertext_b64
    try:
        aead_mod = importlib.import_module('cryptography.hazmat.primitives.ciphers.aead')
        AESGCM = getattr(aead_mod, 'AESGCM')
        raw = base64.b64decode(ciphertext_b64)
        if len(raw) < 16 or not raw.startswith(b"KEO1"):
            # Too short to be nonce+ciphertext; treat as plaintext
            return ciphertext_b64
        body = raw[4:]
        nonce, ct = body[:12], body[12:]
        key = _derive_key(user_id, master)
        aes = AESGCM(key)
        pt = aes.decrypt(nonce, ct, None)
        return pt.decode("utf-8")
    except Exception:
        # If not valid base64/AES-GCM, assume it's plaintext for backward compatibility
        return ciphertext_b64

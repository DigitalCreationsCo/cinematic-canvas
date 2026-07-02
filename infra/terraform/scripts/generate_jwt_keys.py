#!/usr/bin/env python3
"""Generates the RSA keypair that backs Lore's self-issued auth tokens.

Run once via Terraform's local-exec, on whatever machine runs
`terraform apply`. Idempotent: if a keypair already exists in the
output directory, it's left untouched so re-applying Terraform doesn't
silently rotate keys (and invalidate every token already handed out).
Delete the output directory yourself to force rotation.

Writes:
  <out>/private_key.pem  -- RSA private key (PKCS8 PEM). Uploaded to
                             Secret Manager by Terraform; also usable
                             locally with mint_token.py --key-file.
  <out>/jwks.json         -- public half, JWK Set format. Baked into
                             the VM's instance metadata and served
                             locally on the VM for loreserver to fetch
                             at startup ([server.auth.jwk].endpoint).
  <out>/kid.txt            -- the key ID, shared between the JWKS entry
                             and every token mint_token.py issues.
"""

import base64
import hashlib
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

EXPECTED_ARGC = 2


def b64url_uint(n: int) -> str:
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def main() -> None:
    if len(sys.argv) != EXPECTED_ARGC:
        error_msg = f"usage: {sys.argv[0]} <output-dir>"
        raise SystemExit(error_msg)

    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)

    priv_path = out_dir / "private_key.pem"
    jwks_path = out_dir / "jwks.json"
    kid_path = out_dir / "kid.txt"

    if priv_path.exists() and jwks_path.exists() and kid_path.exists():
        print(f"[generate_jwt_keys] keypair already present in {out_dir}, leaving it alone.")  # noqa: T201
        return

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub = key.public_key()

    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    priv_path.write_bytes(priv_pem)
    priv_path.chmod(0o600)

    pub_der = pub.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    kid = hashlib.sha256(pub_der).hexdigest()[:16]

    pub_numbers = pub.public_numbers()
    jwk = {
        "kty": "RSA",
        "use": "sig",
        "alg": "RS256",
        "kid": kid,
        "n": b64url_uint(pub_numbers.n),
        "e": b64url_uint(pub_numbers.e),
    }
    jwks_path.write_text(json.dumps({"keys": [jwk]}, indent=2))
    kid_path.write_text(kid)

    print(f"[generate_jwt_keys] generated new RSA keypair, kid={kid}, written to {out_dir}")  # noqa: T201


if __name__ == "__main__":
    main()

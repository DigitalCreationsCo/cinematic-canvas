#!/usr/bin/env python3
r"""Mints a Lore access token.

This is the "application" piece: anything holding the signing key can
run this to hand a user or service a token for `lore login`. The
private key never touches the loreserver VM -- only its public half
does (baked into the VM as a JWKS file at boot). Whoever runs this
script (or the service that wraps it) IS your identity provider --
there's no third-party OIDC involved, by design.

Examples:
    # Pull the signing key from AWS Secrets Manager (needs
    # secretsmanager:GetSecretValue permission):
    python3 mint_token.py --subject alex@example.com \\
        --aws-region us-east-1 \\
        --aws-secret-id portals/production/jwt-private-key \\
        --expires-in 86400

    # Pull the signing key from GCP Secret Manager (needs
    # secretmanager.secretAccessor on the secret Terraform created):
    python3 mint_token.py --subject alex@example.com \\
        --project-id my-gcp-project --expires-in 86400

    # Or use a local copy of the key (e.g. the one Terraform left in
    # terraform/generated/ on the machine that ran `terraform apply`):
    python3 mint_token.py --subject alex@example.com \\
        --key-file ../terraform/generated/private_key.pem \\
        --kid-file ../terraform/generated/kid.txt
"""

import argparse
import time
from pathlib import Path

import jwt  # PyJWT


def load_private_key(args: argparse.Namespace) -> str:
    if args.key_file:
        return Path(args.key_file).read_text()

    if args.aws_secret_id:
        import boto3

        client = boto3.client("secretsmanager", region_name=args.aws_region)
        response = client.get_secret_value(SecretId=args.aws_secret_id)
        return response["SecretString"]

    from google.cloud import secretmanager

    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{args.project_id}/secrets/{args.secret_id}/versions/latest"
    response = client.access_secret_version(name=name)
    return response.payload.data.decode("utf-8")


def load_kid(args: argparse.Namespace) -> str:
    if args.kid:
        return args.kid
    return Path(args.kid_file).read_text().strip()


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--subject", required=True, help="Identity embedded as the token's `sub` claim.")
    p.add_argument("--expires-in", type=int, default=86400, help="Token lifetime in seconds (default: 1 day).")
    p.add_argument("--issuer", default="lore-token-issuer", help="Must match `jwt_issuer` in local.toml.")
    p.add_argument("--audience", default="lore-server", help="Must match an entry in `jwt_audience` in local.toml.")
    p.add_argument("--kid", help="Key ID to stamp into the token header.")
    p.add_argument(
        "--kid-file",
        default="../terraform/generated/kid.txt",
        help="File containing the key ID (default: ../terraform/generated/kid.txt).",
    )
    p.add_argument("--key-file", help="Local PEM private key. If omitted, fetched from Secret Manager instead.")
    p.add_argument("--project-id", help="GCP project ID (required when fetching the key from GCP Secret Manager).")
    p.add_argument(
        "--secret-id",
        default=None,
        help="GCP Secret Manager secret ID (default: <instance_name>-jwt-signing-key).",
    )
    p.add_argument("--aws-region", help="AWS region (required when fetching the key from AWS Secrets Manager).")
    p.add_argument(
        "--aws-secret-id",
        default=None,
        help="AWS Secrets Manager secret ID (e.g., portals/production/jwt-private-key).",
    )
    args = p.parse_args()

    if not args.secret_id:
        args.secret_id = "lore-server-jwt-signing-key"  # noqa: S105

    if not args.key_file and not args.project_id and not args.aws_secret_id:
        error_msg = (
            "Pass --project-id (to read GCP Secret Manager), "
            "--aws-region and --aws-secret-id (to read AWS Secrets Manager), "
            "or --key-file (to use a local PEM)."
        )
        raise SystemExit(error_msg)

    if args.aws_secret_id and not args.aws_region:
        error_msg = "Pass --aws-region when using --aws-secret-id."
        raise SystemExit(error_msg)

    private_key = load_private_key(args)
    kid = load_kid(args)

    now = int(time.time())
    payload = {
        "iss": args.issuer,
        "aud": args.audience,
        "sub": args.subject,
        "iat": now,
        "exp": now + args.expires_in,
    }

    token = jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})
    print(token)  # noqa: T201


if __name__ == "__main__":
    main()

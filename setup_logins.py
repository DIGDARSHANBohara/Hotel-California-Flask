r"""Give the four existing presentation accounts passwords only if unset.

Run once: .\.venv\Scripts\python.exe setup_logins.py
Existing password hashes are never overwritten. Booking and payment rows are untouched.
"""
import os
from werkzeug.security import generate_password_hash
from app import ACTORS, database, password, query


def initialize_logins(connection, initial_password):
    password(initial_password)
    accounts = []
    for role, code in ACTORS.items():
        rows = query(connection, "SELECT id,email,role,password_hash FROM users WHERE display_code=%s FOR UPDATE", [code])
        if not rows or rows[0]["role"] != role:
            raise ValueError(f"Expected sample account {code} is missing or has a different role.")
        account = rows[0]
        initialized = not account["password_hash"]
        if initialized:
            query(connection, "UPDATE users SET password_hash=%s WHERE id=%s AND password_hash IS NULL",
                  [generate_password_hash(initial_password), account["id"]])
        accounts.append({"role": role, "email": account["email"], "initialized": initialized})
    return accounts


if __name__ == "__main__":
    initial_password = os.environ.get("HOTEL_DEMO_PASSWORD")
    if not initial_password:
        raise SystemExit("Set HOTEL_DEMO_PASSWORD to the sample-account password before running this script.")
    with database() as connection:
        accounts = initialize_logins(connection, initial_password)
    for account in accounts:
        status = "password initialized" if account["initialized"] else "existing password preserved"
        print(f"{account['role']}: {account['email']} ({status})")

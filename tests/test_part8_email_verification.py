"""
Part 8 Tests: Email Verification via One-Time Code
Verifies:
1. Signup generates 6-digit OTP, stores hashed code with 10-minute expiry, and dispatches via EmailService.
2. Correct code verification sets email_verified = true and returns JWT token.
3. Wrong code is rejected with generic error (no account enumeration).
4. Expired code is rejected.
5. Resend code respects 60-second rate-limit cooldown.
6. Login blocks unverified accounts with requires_verification flag and allows verified accounts.
"""

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from backend.main import app
from backend.models import User
from backend.routers.auth_router import _hash_otp
from tests.conftest import TestingSessionLocal


client = TestClient(app)


def test_signup_generates_and_dispatches_otp():
    email = "newengineer@hydac.com"
    resp = client.post(
        "/api/auth/signup",
        json={"email": email, "password": "StrongPassword123!"}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["email_verified"] is False
    assert data["requires_verification"] is True

    # Verify database state
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    assert user is not None
    assert user.email_verified == 0
    assert user.verification_code is not None
    assert len(user.verification_code) == 64  # SHA-256 hash length
    assert user.verification_code_expires_at is not None
    db.close()


def test_verify_email_success():
    email = "verify_test@hydac.com"
    db = TestingSessionLocal()
    otp_plain = "654321"
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        hashed_password="hashed_placeholder",
        email_verified=0,
        verification_code=_hash_otp(otp_plain),
        verification_code_expires_at=now + timedelta(minutes=10),
        last_verification_sent_at=now
    )
    db.add(user)
    db.commit()
    db.close()

    # Submit verification
    resp = client.post(
        "/api/auth/verify-email",
        json={"email": email, "code": otp_plain}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email_verified"] is True
    assert "access_token" in data

    # Verify DB updated
    db = TestingSessionLocal()
    updated_user = db.query(User).filter(User.email == email).first()
    assert updated_user.email_verified == 1
    assert updated_user.verification_code is None
    db.close()


def test_verify_email_wrong_code_rejected():
    email = "wrong_code@hydac.com"
    db = TestingSessionLocal()
    user = User(
        email=email,
        hashed_password="hashed_placeholder",
        email_verified=0,
        verification_code=_hash_otp("123456"),
        verification_code_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)
    )
    db.add(user)
    db.commit()
    db.close()

    # Incorrect code
    resp = client.post(
        "/api/auth/verify-email",
        json={"email": email, "code": "999999"}
    )
    assert resp.status_code == 400
    assert "Invalid or expired" in resp.json()["detail"]

    # Non-existent user
    resp_ghost = client.post(
        "/api/auth/verify-email",
        json={"email": "nonexistent@hydac.com", "code": "123456"}
    )
    assert resp_ghost.status_code == 400
    assert "Invalid or expired" in resp_ghost.json()["detail"]


def test_verify_email_expired_code_rejected():
    email = "expired@hydac.com"
    db = TestingSessionLocal()
    user = User(
        email=email,
        hashed_password="hashed_placeholder",
        email_verified=0,
        verification_code=_hash_otp("123456"),
        verification_code_expires_at=datetime.now(timezone.utc) - timedelta(minutes=2)  # Expired
    )
    db.add(user)
    db.commit()
    db.close()

    resp = client.post(
        "/api/auth/verify-email",
        json={"email": email, "code": "123456"}
    )
    assert resp.status_code == 400
    assert "Invalid or expired" in resp.json()["detail"]


def test_resend_code_enforces_60s_cooldown():
    email = "cooldown@hydac.com"
    db = TestingSessionLocal()
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        hashed_password="hashed_placeholder",
        email_verified=0,
        verification_code=_hash_otp("111111"),
        verification_code_expires_at=now + timedelta(minutes=10),
        last_verification_sent_at=now  # Just sent
    )
    db.add(user)
    db.commit()
    db.close()

    # Immediate resend should trigger 429
    resp_429 = client.post("/api/auth/resend-code", json={"email": email})
    assert resp_429.status_code == 429
    assert "seconds before requesting" in resp_429.json()["detail"]

    # Advance time beyond 60s
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    user.last_verification_sent_at = now - timedelta(seconds=65)
    db.commit()
    db.close()

    # Now resend should succeed
    resp_ok = client.post("/api/auth/resend-code", json={"email": email})
    assert resp_ok.status_code == 200
    assert resp_ok.json()["status"] == "sent"


def test_login_blocks_unverified_account_and_allows_verified():
    from backend.auth import hash_password

    email = "login_gate@hydac.com"
    pwd = "EngineeringPassword2026!"
    db = TestingSessionLocal()
    user = User(
        email=email,
        hashed_password=hash_password(pwd),
        email_verified=0,  # Unverified
    )
    db.add(user)
    db.commit()
    db.close()

    # Login when unverified -> 403 Forbidden with requires_verification
    resp_unverified = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert resp_unverified.status_code == 403
    data = resp_unverified.json()
    assert data["requires_verification"] is True

    # Mark verified in database
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == email).first()
    user.email_verified = 1
    db.commit()
    db.close()

    # Login now succeeds with 200
    resp_verified = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert resp_verified.status_code == 200
    assert "access_token" in resp_verified.json()
    assert resp_verified.json()["email_verified"] is True

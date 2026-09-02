"""
HYDAC Spec-to-3D Generator — Authentication Router (Part 8 Enhanced)
POST /signup — creates user, generates 6-digit OTP, sends verification email
POST /verify-email — validates OTP, marks email_verified = true
POST /resend-code — resends OTP with 60-second cooldown rate limit
POST /login — authenticates user, blocks unverified accounts with requires_verification flag
GET /me — returns authenticated user profile
"""

import random
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    VerifyEmailRequest, ResendCodeRequest, VerifyEmailResponse
)
from backend.auth import hash_password, verify_password, create_access_token, get_current_user
from backend.email_service import EmailService

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def _generate_otp() -> str:
    """Generate a secure 6-digit numeric OTP code."""
    return f"{random.randint(100000, 999999):06d}"


def _hash_otp(code: str) -> str:
    """Hash the 6-digit OTP code using SHA-256 for secure storage."""
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _verify_otp(plain_code: str, hashed_code: str) -> bool:
    """Constant-time comparison of OTP against stored hash."""
    if not hashed_code or not plain_code:
        return False
    return secrets.compare_digest(_hash_otp(plain_code), hashed_code)


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user account. Generates and sends a 6-digit verification code.
    """
    existing = db.query(User).filter(User.email == user_data.email.strip().lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Generate 6-digit OTP
    otp = _generate_otp()
    otp_hash = _hash_otp(otp)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    # Create user (email_verified = 0)
    user = User(
        email=user_data.email.strip().lower(),
        hashed_password=hash_password(user_data.password),
        email_verified=0,
        verification_code=otp_hash,
        verification_code_expires_at=expires_at,
        last_verification_sent_at=now,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Send verification email (or log in console mode)
    EmailService.send_verification_email(user.email, otp)

    # Return token with verification flag
    token = create_access_token(data={"sub": user.id})
    return TokenResponse(
        access_token=token,
        email_verified=False,
        requires_verification=True,
        message="Account created. Please enter the 6-digit verification code sent to your email."
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Verify the 6-digit one-time code. On success, marks email_verified = true.
    """
    email_clean = req.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    now = datetime.now(timezone.utc)

    # Generic error message to prevent account enumeration
    invalid_err = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired verification code."
    )

    if not user or not user.verification_code:
        raise invalid_err

    # Check expiration
    if not user.verification_code_expires_at or user.verification_code_expires_at.replace(tzinfo=timezone.utc if user.verification_code_expires_at.tzinfo is None else None) < now:
        raise invalid_err

    # Verify code hash
    if not _verify_otp(req.code, user.verification_code):
        raise invalid_err

    # Success: mark verified and clear code
    user.email_verified = 1
    user.verification_code = None
    user.verification_code_expires_at = None
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": user.id})
    return VerifyEmailResponse(
        message="Email verified successfully. You may now access the system.",
        email_verified=True,
        access_token=token
    )


@router.post("/resend-code")
def resend_verification_code(req: ResendCodeRequest, db: Session = Depends(get_db)):
    """
    Resend verification code with a strict 60-second rate-limit cooldown per account.
    """
    email_clean = req.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()

    now = datetime.now(timezone.utc)

    if user:
        if user.email_verified:
            return {"message": "Email is already verified. You can log in directly.", "already_verified": True}

        # 60-second cooldown check
        if user.last_verification_sent_at:
            last_sent = user.last_verification_sent_at
            if last_sent.tzinfo is None:
                last_sent = last_sent.replace(tzinfo=timezone.utc)
            elapsed = (now - last_sent).total_seconds()
            if elapsed < 60:
                wait_sec = int(60 - elapsed)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Please wait {wait_sec} seconds before requesting a new verification code."
                )

        # Generate fresh OTP
        otp = _generate_otp()
        user.verification_code = _hash_otp(otp)
        user.verification_code_expires_at = now + timedelta(minutes=10)
        user.last_verification_sent_at = now
        db.commit()

        EmailService.send_verification_email(user.email, otp)

    # Universal response to avoid account enumeration
    return {
        "message": "If an account with this email exists, a new verification code has been sent.",
        "status": "sent"
    }


@router.post("/login", response_model=TokenResponse)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user. If unverified, returns 403 with requires_verification flag.
    """
    email_clean = user_data.email.strip().lower()
    user = db.query(User).filter(User.email == email_clean).first()
    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Block unverified accounts with actionable flag
    if not user.email_verified:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": "Email verification required. Please verify your email before logging in.",
                "requires_verification": True,
                "email": user.email,
            }
        )

    token = create_access_token(data={"sub": user.id})
    return TokenResponse(
        access_token=token,
        email_verified=True,
        requires_verification=False,
        message="Login successful."
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        email_verified=bool(current_user.email_verified),
        created_at=current_user.created_at
    )

"""
Authentication router.

Endpoints:
  POST /auth/token  — login, returns JWT
  GET  /auth/me     — current user profile
  POST /auth/refresh — refresh access token
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.dependencies import get_current_user, get_db
from core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
    ROLE_ADMIN,
)
from db.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    username: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helper: create default users if they don't exist
# ---------------------------------------------------------------------------
def ensure_default_users_exist(db: Session) -> None:
    """Create default users (admin, analyst, analysis, viewer) if they don't exist."""
    from core.config import settings  # local import to avoid circular
    from core.security import ROLE_ADMIN, ROLE_ANALYST, ROLE_VIEWER

    # 1. Admin
    admin_user = db.query(User).filter(User.username == settings.ADMIN_USERNAME).first()
    if admin_user is None:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            hashed_password=hash_password(settings.ADMIN_PASSWORD),
            role=ROLE_ADMIN,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(admin_user)
        logger.info("Default admin user created: %s", settings.ADMIN_USERNAME)

    # 2. Analyst
    analyst_user = db.query(User).filter(User.username == "analyst").first()
    if analyst_user is None:
        analyst_user = User(
            username="analyst",
            email="analyst@treasury.local",
            hashed_password=hash_password("Analyst@2026"),
            role=ROLE_ANALYST,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(analyst_user)
        logger.info("Default analyst user created: analyst")

    # 3. Analysis
    analysis_user = db.query(User).filter(User.username == "analysis").first()
    if analysis_user is None:
        analysis_user = User(
            username="analysis",
            email="analysis@treasury.local",
            hashed_password=hash_password("Analyst@2026"),
            role=ROLE_ANALYST,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(analysis_user)
        logger.info("Default analysis user created: analysis")

    # 4. Viewer
    viewer_user = db.query(User).filter(User.username == "viewer").first()
    if viewer_user is None:
        viewer_user = User(
            username="viewer",
            email="viewer@treasury.local",
            hashed_password=hash_password("Viewer@2026"),
            role=ROLE_VIEWER,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db.add(viewer_user)
        logger.info("Default viewer user created: viewer")

    db.commit()

ensure_admin_exists = ensure_default_users_exist


# ---------------------------------------------------------------------------
# POST /auth/token
# ---------------------------------------------------------------------------
@router.post("/token", response_model=TokenResponse, summary="Login and obtain JWT")
@router.post("/login", response_model=TokenResponse, summary="Login and obtain JWT")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Authenticate with username + password (form data).

    Returns an access token and refresh token.
    """
    user: User | None = (
        db.query(User).filter(func.lower(User.username) == func.lower(form_data.username)).first()
    )

    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    token_data = {"sub": user.username, "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        role=user.role,
        username=user.username,
    )


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserProfile, summary="Current user profile")
async def get_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the profile of the currently authenticated user."""
    return current_user


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------
@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh_token(
    body: RefreshRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    """
    from jose import JWTError

    try:
        payload = verify_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is not a refresh token",
        )

    username: str | None = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token",
        )

    user: User | None = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    token_data = {"sub": user.username, "role": user.role}
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        role=user.role,
        username=user.username,
    )

"""
FastAPI dependency injection helpers.
"""
from __future__ import annotations

from typing import Callable, Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from core.security import verify_token, ROLE_ADMIN, ROLE_ANALYST, ROLE_VIEWER
from db.database import SessionLocal
from db.models import User

# ---------------------------------------------------------------------------
# OAuth2 scheme – clients must send Bearer token in Authorization header
# ---------------------------------------------------------------------------
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


# ---------------------------------------------------------------------------
# Database session dependency
# ---------------------------------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session; always closes on exit."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Current-user dependency
# ---------------------------------------------------------------------------
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Decode the Bearer JWT token and load the corresponding User from the DB.

    Raises:
        HTTPException 401: If token is missing, invalid, expired, or user not found.
        HTTPException 403: If the user account is deactivated.
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = verify_token(token)
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user: User | None = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exc
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    return user


# ---------------------------------------------------------------------------
# Role-based access dependency factory
# ---------------------------------------------------------------------------
def require_role(*roles: str) -> Callable[..., User]:
    """
    Return a FastAPI dependency that requires the current user to have one
    of the specified *roles*.

    Example::

        @router.post("/admin-only")
        def admin_endpoint(user = Depends(require_role("admin"))):
            ...
    """

    def _check_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {list(roles)}",
            )
        return current_user

    return _check_role


# ---------------------------------------------------------------------------
# Shortcut dependencies
# ---------------------------------------------------------------------------
def get_current_admin_user(
    current_user: User = Depends(require_role(ROLE_ADMIN)),
) -> User:
    """Require ADMIN role."""
    return current_user


def get_current_analyst_user(
    current_user: User = Depends(require_role(ROLE_ADMIN, ROLE_ANALYST)),
) -> User:
    """Require ANALYST or ADMIN role."""
    return current_user

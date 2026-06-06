from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.schemas import AuthRequest, AuthResponse, RefreshRequest, UserResponse
from app.security import create_access_token, new_refresh_token, refresh_expires_at
from app.supabase_client import SupabaseApiError, SupabaseRestClient, get_supabase_client

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _auth_response(client: SupabaseRestClient, user: dict) -> AuthResponse:
    refresh_token = new_refresh_token()
    client.store_refresh_token(user["id"], refresh_token, refresh_expires_at())
    return AuthResponse(
        user=UserResponse(id=user["id"], email=user["email"]),
        access_token=create_access_token(user["id"]),
        refresh_token=refresh_token,
    )


def _auth_exception(exc: SupabaseApiError, *, operation: str) -> HTTPException:
    message = exc.message.lower()
    if operation == "login" and exc.status_code == 400 and "invalid login credentials" in message:
        return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)
    if operation == "register" and exc.status_code == 400 and "already registered" in message:
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: AuthRequest, client: SupabaseRestClient = Depends(get_supabase_client)) -> AuthResponse:
    try:
        return _auth_response(client, client.register(req.email.lower(), req.password))
    except SupabaseApiError as exc:
        raise _auth_exception(exc, operation="register") from exc


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, client: SupabaseRestClient = Depends(get_supabase_client)) -> AuthResponse:
    try:
        return _auth_response(client, client.login(req.email.lower(), req.password))
    except SupabaseApiError as exc:
        raise _auth_exception(exc, operation="login") from exc


@router.post("/refresh", response_model=AuthResponse)
def refresh(req: RefreshRequest, client: SupabaseRestClient = Depends(get_supabase_client)) -> AuthResponse:
    try:
        user = client.consume_refresh_token(req.refresh_token)
        if user is None:
            raise SupabaseApiError(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
        return _auth_response(client, user)
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(req: RefreshRequest, client: SupabaseRestClient = Depends(get_supabase_client)) -> Response:
    client.logout(req.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

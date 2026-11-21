from asyncio import Semaphore, timeout
from contextlib import AsyncExitStack, asynccontextmanager
from time import perf_counter
from uuid import uuid4

import httpx
import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .barcodes import OPEN_FOOD_FACTS_BASE_URL
from .config import Settings
from .errors import ApiError, responses
from .routes import api
from .schemas import ErrorField, ErrorView, HealthView

log = structlog.get_logger()


def error_response(
    request: Request, error: ApiError, headers: dict[str, str] | None = None
) -> JSONResponse:
    content = ErrorView(
        code=error.code,
        message=str(error),
        request_id=request.state.request_id,
        fields=error.fields,
    )
    if error.status_code == 401:
        headers = {"WWW-Authenticate": "Bearer", **(headers or {})}
    return JSONResponse(
        status_code=error.status_code,
        content=content.model_dump(mode="json"),
        headers=headers,
    )


class RequestLogging:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        status = 500
        response_started = False
        started = perf_counter()

        async def send_response(message: Message) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                headers = MutableHeaders(scope=message)
                headers["X-Request-ID"] = request_id
                if scope["path"].startswith("/api/"):
                    headers["Cache-Control"] = "no-store"
            await send(message)

        try:
            await self.app(scope, receive, send_response)
        except Exception as error:
            if response_started:
                raise
            details = (
                {"missing_module": error.name} if isinstance(error, ModuleNotFoundError) else {}
            )
            log.error(
                "request_failed", request_id=request_id, error_type=type(error).__name__, **details
            )
            response = error_response(
                Request(scope),
                ApiError(500, "internal_error", "The request could not be completed."),
            )
            await response(scope, receive, send_response)
        finally:
            log.info(
                "request_completed",
                request_id=request_id,
                method=scope["method"],
                route=getattr(scope.get("route"), "path", None),
                status=status,
                duration_ms=round((perf_counter() - started) * 1000, 2),
            )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    postgres_url = settings.postgres_url()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        structlog.configure(
            processors=[
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso", utc=True),
                structlog.processors.JSONRenderer(),
            ],
        )
        async with AsyncExitStack() as stack:
            app.state.sessions = None
            app.state.password_workers = Semaphore(4)
            if postgres_url is not None:
                engine = create_async_engine(
                    postgres_url,
                    pool_pre_ping=True,
                    pool_timeout=5,
                    connect_args={"connect_timeout": 5},
                    hide_parameters=True,
                )
                stack.push_async_callback(engine.dispose)
                app.state.sessions = async_sessionmaker(engine, expire_on_commit=False)
            app.state.barcode_client = await stack.enter_async_context(
                httpx.AsyncClient(
                    base_url=OPEN_FOOD_FACTS_BASE_URL,
                    headers={
                        "User-Agent": settings.open_food_facts_user_agent,
                        "Accept": "application/json",
                    },
                    timeout=httpx.Timeout(6, connect=3),
                    follow_redirects=False,
                )
            )
            app.state.openai_client = None
            api_key = settings.openai_api_key
            if api_key and (key := api_key.get_secret_value().strip()):
                app.state.openai_client = await stack.enter_async_context(AsyncOpenAI(api_key=key))
            yield

    app = FastAPI(
        title="Fridgellio API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        redoc_url=None,
    )
    app.state.settings = settings
    app.add_middleware(RequestLogging)
    app.include_router(api)

    @app.exception_handler(ApiError)
    async def application_error(request: Request, error: ApiError) -> JSONResponse:
        return error_response(request, error)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        fields = [
            ErrorField(path=list(issue["loc"]), message=issue["msg"]) for issue in error.errors()
        ]
        return error_response(
            request, ApiError(422, "invalid_request", "Check the request fields.", fields)
        )

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return error_response(
            request, ApiError(error.status_code, "http_error", str(error.detail)), error.headers
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, error: SQLAlchemyError) -> JSONResponse:
        log.error(
            "database_error", request_id=request.state.request_id, error_type=type(error).__name__
        )
        return error_response(
            request, ApiError(503, "database_unavailable", "The database operation failed.")
        )

    @app.get("/health/live", tags=["Health"])
    async def live() -> HealthView:
        return HealthView()

    @app.get("/health/ready", tags=["Health"], responses=responses(503))
    async def ready(request: Request) -> HealthView:
        sessions = request.app.state.sessions
        if sessions is None:
            raise ApiError(503, "database_unavailable", "The database is not configured.")
        try:
            async with timeout(3):
                async with sessions() as session:
                    await session.execute(text("SELECT 1"))
        except TimeoutError:
            raise ApiError(503, "database_unavailable", "The database check timed out.") from None
        return HealthView()

    return app

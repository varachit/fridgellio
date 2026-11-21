from fastapi.testclient import TestClient

from fridgellio.config import Settings
from fridgellio.main import create_app


def test_schema_and_auth():
    app = create_app(Settings(_env_file=None, database_url=None, docs_enabled=True))
    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()
        assert spec["components"]["securitySchemes"]["AccountSession"] == {
            "type": "http",
            "scheme": "bearer",
        }
        assert spec["paths"]["/api/menus"]["post"]["security"] == [{"AccountSession": []}]
        assert "security" not in spec["paths"]["/api/auth/login"]["post"]
        assert "security" not in spec["paths"]["/api/auth/register"]["post"]
        assert "501" in spec["paths"]["/api/menus"]["post"]["responses"]
        assert (
            "multipart/form-data"
            in spec["paths"]["/api/photos/analyze"]["post"]["requestBody"]["content"]
        )
        assert client.get("/docs").status_code == 200
        assert client.get("/health/live").json() == {"status": "ok"}
        assert client.get("/health/ready").status_code == 503
        assert client.post("/api/menus").status_code == 401
        assert (
            client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code
            == 401
        )

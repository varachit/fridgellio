from .schemas import ErrorField, ErrorView


class ApiError(Exception):
    def __init__(
        self, status_code: int, code: str, message: str, fields: list[ErrorField] | None = None
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.fields = fields or []


def responses(*status_codes: int) -> dict:
    return {code: {"model": ErrorView} for code in status_codes}

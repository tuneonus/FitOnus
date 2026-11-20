"""Request/response models for the health endpoint.

`contracts/` holds the typed shapes exchanged over HTTP (Pydantic). It contains no logic, so the
Node backend's client types can later be generated from it.
"""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str

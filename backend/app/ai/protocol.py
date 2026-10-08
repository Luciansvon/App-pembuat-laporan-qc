from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class Suggestion:
    text: str
    provider: str
    status: Literal["suggested", "confirmed", "rejected"] = "suggested"
    confidence: float | None = None


class AIProvider(Protocol):
    """A provider returns suggestions; it has no database mutation authority."""

    async def suggest(self, task: str, verified_context: str) -> list[Suggestion]: ...


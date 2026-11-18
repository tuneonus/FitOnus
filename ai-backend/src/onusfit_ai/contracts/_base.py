"""Shared Pydantic settings for every contract.

* camelCase on the wire (matches the Node/TypeScript side), snake_case in Python.
* `extra="forbid"`: an unknown field is a contract bug, so reject it loudly instead of ignoring it.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

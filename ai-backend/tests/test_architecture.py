"""Architecture boundaries, enforced (audit finding: the folders existed but nothing checked them).

Feature-based modular Clean Architecture, as this service uses it:

    features/<feature>/domain        contracts + pure rules.     pydantic and shared.contracts/utils only
    features/<feature>/application   use cases, parsers, prompts. + shared.llm.ports/telemetry, shared.logging
    features/<feature>/presentation  FastAPI routers.            + fastapi, shared.auth, shared.llm.dependencies
    shared/                          cross-cutting code; `contracts`, `utils`, `logging`, `config`,
                                     `llm.ports` and `llm.telemetry` are "pure": no framework, no SDK.

The rules below are checked on the real source tree (static, from the AST) and by importing the inner
layers in a fresh interpreter. `collect_violations` is also run on tiny synthetic trees that break each
rule, so a checker that silently stopped checking would fail here too.
"""

import ast
import json
import subprocess
import sys
from collections import defaultdict
from collections.abc import Iterator
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
PKG = "onusfit_ai"
STDLIB = sys.stdlib_module_names

# What each feature layer may import from shared/ (a name allows itself and everything below it).
SHARED_FOR_LAYER = {
    "domain": ("shared.contracts", "shared.utils"),
    "application": (
        "shared.contracts",
        "shared.utils",
        "shared.llm.ports",
        "shared.llm.telemetry",
        "shared.logging",
    ),
    "presentation": (
        "shared.auth",
        "shared.contracts",
        "shared.llm.ports",
        "shared.llm.dependencies",
        "shared.tools",
    ),
}
# Which layers of its OWN feature each layer may import. Never another feature, never outwards.
OWN_LAYERS = {
    "domain": {"domain"},
    "application": {"domain", "application"},
    "presentation": {"domain", "application", "presentation"},
}
THIRD_PARTY_FOR_LAYER = {
    "domain": {"pydantic"},
    "application": {"pydantic"},
    "presentation": {"fastapi", "pydantic"},
}
# Shared modules the inner layers import: they must not drag in a framework or an SDK themselves.
PURE_SHARED = (
    "shared.contracts",
    "shared.utils",
    "shared.logging",
    "shared.config",
    "shared.llm.ports",
    "shared.llm.telemetry",
)
# The one module allowed to import each provider/security library.
SDK_HOMES = {
    "google": {"shared.llm.gemini"},
    "httpx": {"shared.llm.errors", "shared.tools.client"},
    "jwt": {"shared.auth.auth"},
}
FRAMEWORK_AND_SDK = {"fastapi", "starlette", "google", "jwt", "httpx"}


def _under(module: str, prefixes: tuple[str, ...] | set[str] | list[str]) -> bool:
    return any(module == p or module.startswith(p + ".") for p in prefixes)


def _module_name(root: Path, file: Path) -> str:
    parts = list(file.relative_to(root).with_suffix("").parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _parts(module: str) -> tuple[str | None, str | None]:
    """(feature, layer) for `onusfit_ai.features.<feature>.<layer>...`; layer is '' for the feature root."""
    p = module.split(".")
    if len(p) >= 3 and p[:2] == [PKG, "features"]:
        return p[2], (p[3] if len(p) > 3 else "")
    return None, None


def _imports(tree: ast.AST) -> Iterator[tuple[str, int, bool]]:
    """(module, line, relative) for every import. `from a import b` also yields `a.b` (maybe a module)."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name, node.lineno, False
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                yield "." * node.level + (node.module or ""), node.lineno, True
            elif node.module:
                yield node.module, node.lineno, False
                for alias in node.names:
                    yield f"{node.module}.{alias.name}", node.lineno, False


def collect_violations(src: Path) -> list[str]:
    files = sorted((src / PKG).rglob("*.py"))
    known = {_module_name(src, f) for f in files}
    violations: list[str] = []
    graph: dict[str, set[str]] = defaultdict(set)

    for file in files:
        module = _module_name(src, file)
        rel = shared = module.removeprefix(f"{PKG}.")
        feature, layer = _parts(module)
        tree = ast.parse(file.read_text(encoding="utf-8"))
        where = f"{file.relative_to(src)}"

        for target, line, relative in _imports(tree):
            if relative:
                violations.append(
                    f"{where}:{line} relative import {target!r}: use absolute imports"
                )
                continue
            top = target.split(".")[0]
            internal = top == PKG
            if internal and target not in known and target.rsplit(".", 1)[0] not in known:
                continue  # `from pkg import some_name`: only real modules matter
            if internal and target in known and target != module:
                graph[module].add(target)

            if feature is not None and layer == "":
                violations.append(
                    f"{where}:{line} feature root imports {target!r}: it must re-export nothing"
                )
            elif feature is not None and layer in OWN_LAYERS:
                if internal and target in known:
                    t_feature, t_layer = _parts(target)
                    t_shared = target.removeprefix(f"{PKG}.")
                    if t_feature is not None and t_feature != feature:
                        violations.append(
                            f"{where}:{line} {feature}->{t_feature} (features must not import each other)"
                        )
                    elif t_feature is not None and t_layer not in OWN_LAYERS[layer]:
                        violations.append(
                            f"{where}:{line} {layer} imports {t_layer or 'feature root'} ({target})"
                        )
                    elif t_feature is None and not _under(t_shared, SHARED_FOR_LAYER[layer]):
                        violations.append(f"{where}:{line} {layer} may not import {t_shared}")
                elif not internal and top not in STDLIB and top not in THIRD_PARTY_FOR_LAYER[layer]:
                    violations.append(f"{where}:{line} {layer} may not import third-party {top!r}")
            elif rel.startswith("shared"):
                if internal and target in known and _parts(target)[0] is not None:
                    violations.append(f"{where}:{line} shared code imports a feature ({target})")
                if _under(shared, ("shared.llm",)) and _under(
                    target.removeprefix(f"{PKG}."), ("shared.errors",)
                ):
                    violations.append(
                        f"{where}:{line} shared.llm may not import shared.errors ({target.removeprefix(PKG + '.')})"
                    )
                if _under(shared, PURE_SHARED):
                    if (
                        internal
                        and target in known
                        and not _under(target.removeprefix(f"{PKG}."), PURE_SHARED)
                    ):
                        violations.append(
                            f"{where}:{line} pure shared module imports {target.removeprefix(PKG + '.')}"
                        )
                    if not internal and top not in STDLIB and top != "pydantic":
                        violations.append(
                            f"{where}:{line} pure shared module imports third-party {top!r}"
                        )

            if top in SDK_HOMES and shared not in SDK_HOMES[top]:
                violations.append(
                    f"{where}:{line} only {sorted(SDK_HOMES[top])} may import {top!r}"
                )

    violations.extend(_cycles(graph))
    return violations


def _cycles(graph: dict[str, set[str]]) -> list[str]:
    """Strongly connected components with more than one module (Tarjan)."""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    found: list[str] = []

    def visit(node: str) -> None:
        index[node] = low[node] = len(index)
        stack.append(node)
        on_stack.add(node)
        for nxt in graph.get(node, ()):
            if nxt not in index:
                visit(nxt)
                low[node] = min(low[node], low[nxt])
            elif nxt in on_stack:
                low[node] = min(low[node], index[nxt])
        if low[node] == index[node]:
            component = []
            while True:
                member = stack.pop()
                on_stack.discard(member)
                component.append(member)
                if member == node:
                    break
            if len(component) > 1:
                found.append("import cycle: " + " <-> ".join(sorted(component)))

    for node in list(graph):
        if node not in index:
            visit(node)
    return found


# --- the real source tree ---------------------------------------------------------------------------------------


def test_the_source_tree_obeys_every_boundary_rule() -> None:
    assert collect_violations(SRC) == []


def test_the_checker_really_sees_the_code() -> None:
    modules = {_module_name(SRC, f) for f in (SRC / PKG).rglob("*.py")}
    assert len(modules) > 60  # a checker that found nothing would pass the test above vacuously
    for feature in ("coach", "meals", "speech"):
        assert f"{PKG}.features.{feature}.application" in modules
        assert f"{PKG}.features.{feature}.presentation" in modules


def _feature_modules(feature: str, *layers: str) -> list[str]:
    return sorted(
        _module_name(SRC, f)
        for layer in layers
        for f in (SRC / PKG / "features" / feature / layer).rglob("*.py")
    )


def _loaded_after_importing(modules: list[str]) -> set[str]:
    """Import `modules` in a fresh interpreter; which framework/SDK packages did that load?"""
    code = (
        "import json, sys, importlib\n"
        "sys.path.insert(0, sys.argv[1])\n"
        "for name in json.loads(sys.argv[2]): importlib.import_module(name)\n"
        f"print(json.dumps(sorted(m for m in {sorted(FRAMEWORK_AND_SDK)!r} if m in sys.modules)))\n"
    )
    result = subprocess.run(
        [sys.executable, "-I", "-B", "-c", code, str(SRC), json.dumps(modules)],
        capture_output=True,
        text=True,
        check=True,
    )
    return set(json.loads(result.stdout))


@pytest.mark.parametrize("feature", ["coach", "meals", "speech"])
def test_importing_the_inner_layers_loads_no_framework_or_sdk(feature: str) -> None:
    # Static rules say what is IMPORTED; this proves what actually gets LOADED, transitively.
    modules = _feature_modules(feature, "domain", "application")
    assert modules, feature
    assert _loaded_after_importing(modules) == set()


def test_the_runtime_check_would_notice_a_leak() -> None:
    # Control: the adapter pulls in the SDK and presentation pulls in FastAPI; check sees both.
    loaded_adapter = _loaded_after_importing([f"{PKG}.shared.llm.gemini"])
    assert "google" in loaded_adapter
    assert "fastapi" not in loaded_adapter  # decoupled: gemini no longer drags in FastAPI

    loaded_presentation = _loaded_after_importing([f"{PKG}.features.coach.presentation.coach_chat"])
    assert "fastapi" in loaded_presentation


def test_the_llm_port_alone_loads_no_framework_or_sdk() -> None:
    assert (
        _loaded_after_importing([f"{PKG}.shared.llm.ports", f"{PKG}.shared.llm.telemetry"]) == set()
    )


# --- the checker itself, on synthetic trees that break one rule each -----------------------------------------------


def _tree(tmp_path: Path, files: dict[str, str]) -> Path:
    for name, source in files.items():
        path = tmp_path / PKG / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize(
    ("files", "expected"),
    [
        pytest.param(
            {
                "features/a/domain/m.py": "from fastapi import FastAPI\n",
            },
            "domain may not import third-party 'fastapi'",
            id="domain-imports-fastapi",
        ),
        pytest.param(
            {
                "features/a/domain/m.py": "import onusfit_ai.features.a.application.u\n",
                "features/a/application/u.py": "",
            },
            "domain imports application",
            id="domain-imports-application",
        ),
        pytest.param(
            {
                "features/a/application/u.py": "from onusfit_ai.features.a.presentation import r\n",
                "features/a/presentation/r.py": "",
            },
            "application imports presentation",
            id="application-imports-presentation",
        ),
        pytest.param(
            {
                "features/a/application/u.py": "from onusfit_ai.shared.llm.gemini import GeminiClient\n",
                "shared/llm/gemini.py": "",
            },
            "application may not import shared.llm.gemini",
            id="application-imports-the-adapter",
        ),
        pytest.param(
            {
                "features/a/application/u.py": "from onusfit_ai.shared.errors.errors import AiError\n",
                "shared/errors/errors.py": "",
            },
            "application may not import shared.errors.errors",
            id="application-imports-http-errors",
        ),
        pytest.param(
            {
                "features/a/application/u.py": "from onusfit_ai.features.b.domain import m\n",
                "features/b/domain/m.py": "",
            },
            "a->b (features must not import each other)",
            id="cross-feature",
        ),
        pytest.param(
            {
                "shared/utils/x.py": "from onusfit_ai.features.a.domain import m\n",
                "features/a/domain/m.py": "",
            },
            "shared code imports a feature",
            id="shared-imports-a-feature",
        ),
        pytest.param(
            {"shared/contracts/c.py": "from fastapi import FastAPI\n"},
            "pure shared module imports third-party 'fastapi'",
            id="pure-shared-imports-fastapi",
        ),
        pytest.param(
            {
                "shared/utils/a.py": "from onusfit_ai.shared.errors.errors import AiError\n",
                "shared/errors/errors.py": "",
            },
            "pure shared module imports shared.errors.errors",
            id="pure-shared-imports-errors",
        ),
        pytest.param(
            {
                "shared/llm/gemini.py": "from onusfit_ai.shared.errors.errors import AiError\n",
                "shared/errors/errors.py": "",
            },
            "shared.llm may not import shared.errors",
            id="llm-imports-http-errors",
        ),
        pytest.param(
            {"features/a/presentation/r.py": "from google import genai\n"},
            "only ['shared.llm.gemini'] may import 'google'",
            id="sdk-outside-its-home",
        ),
        pytest.param(
            {
                "features/a/__init__.py": "from onusfit_ai.features.a.application import u\n",
                "features/a/application/u.py": "",
            },
            "feature root imports",
            id="feature-root-barrel",
        ),
        pytest.param(
            {"features/a/domain/m.py": "from . import n\n", "features/a/domain/n.py": ""},
            "relative import",
            id="relative-import",
        ),
        pytest.param(
            {
                "features/a/domain/__init__.py": "from onusfit_ai.features.a.domain.m import X\n",
                "features/a/domain/m.py": "from onusfit_ai.features.a.domain import n\n",
                "features/a/domain/n.py": "from onusfit_ai.features.a.domain.m import X\n",
            },
            "import cycle",
            id="cycle",
        ),
    ],
)
def test_the_checker_catches_each_kind_of_violation(
    tmp_path: Path, files: dict[str, str], expected: str
) -> None:
    violations = collect_violations(_tree(tmp_path, files))
    assert any(expected in v for v in violations), violations


def test_the_checker_accepts_a_clean_tree(tmp_path: Path) -> None:
    clean = {
        "features/a/domain/m.py": "from pydantic import BaseModel\nfrom onusfit_ai.shared.contracts.c import C\n",
        "features/a/application/u.py": "from onusfit_ai.features.a.domain.m import M\nfrom onusfit_ai.shared.llm.ports import P\n",
        "features/a/presentation/r.py": "from fastapi import APIRouter\nfrom onusfit_ai.features.a.application.u import run\n",
        "shared/contracts/c.py": "from pydantic import BaseModel\n",
        "shared/llm/ports.py": "",
        "features/a/domain/m_.py": "",
    }
    assert collect_violations(_tree(tmp_path, clean)) == []

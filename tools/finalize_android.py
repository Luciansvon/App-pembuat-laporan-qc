"""Remove optional host speedups and reject incompatible Android native code.

Produces an unsigned APK; zipalign and signing must follow this operation.
MarkupSafe supplies its own pure Python fallback when _speedups is absent.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
import struct
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MACHINES = {"arm64-v8a": 183, "x86_64": 62}
SPEEDUPS = "_python_bundle/site-packages/markupsafe/_speedups.so"


def validate_elf(name: str, data: bytes, abi: str) -> None:
    if data[:6] != b"\x7fELF\x02\x01" or len(data) < 64:
        raise ValueError(f"Invalid ELF64: {name}")
    machine = struct.unpack_from("<H", data, 18)[0]
    if machine != MACHINES[abi]:
        raise ValueError(f"Wrong ABI in {name}: expected {abi}, machine={machine}")
    offset = struct.unpack_from("<Q", data, 32)[0]
    size, count = struct.unpack_from("<HH", data, 54)
    if size < 56 or count == 0 or offset + size * count > len(data):
        raise ValueError(f"Invalid ELF program headers: {name}")
    loads = 0
    for index in range(count):
        kind, _, file_offset, address, _, _, _, alignment = struct.unpack_from(
            "<IIQQQQQQ", data, offset + size * index)
        if kind == 1:
            loads += 1
            minimum = 16384 if abi == "arm64-v8a" else 4096
            if alignment < minimum or file_offset % alignment != address % alignment:
                raise ValueError(f"Invalid load alignment in {name}: {alignment}")
    if not loads:
        raise ValueError(f"No ELF load segments: {name}")


def finalize_bundle(data: bytes, abi: str) -> tuple[bytes, int, int]:
    result = io.BytesIO()
    removed = native = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as source:
        members = source.getmembers()
        names = {member.name for member in members}
        if SPEEDUPS in names and not names.intersection({
                "_python_bundle/site-packages/markupsafe/_native.py",
                "_python_bundle/site-packages/markupsafe/_native.pyc"}):
            raise ValueError("MarkupSafe Python fallback missing")
        with tarfile.open(fileobj=result, mode="w:gz") as target:
            for member in members:
                if member.name == SPEEDUPS:
                    removed += 1
                    continue
                content = source.extractfile(member).read() if member.isfile() else None
                if content is not None and member.name.endswith(".so"):
                    validate_elf(member.name, content, abi)
                    native += 1
                target.addfile(member, io.BytesIO(content) if content is not None else None)
    return result.getvalue(), removed, native


def finalize(source: Path, destination: Path, abi: str) -> dict[str, object]:
    source, destination = source.resolve(), destination.resolve()
    if not destination.is_relative_to((ROOT / ".artifacts").resolve()):
        raise ValueError("APK output must stay inside .artifacts")
    if destination == source or destination.exists():
        raise FileExistsError("Preserve input and existing APK output")
    destination.parent.mkdir(parents=True, exist_ok=True)
    removed = native = 0
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, "w") as output:
        for entry in original.infolist():
            name = entry.filename
            if name.startswith("META-INF/") and (name.endswith((".RSA", ".DSA", ".EC", ".SF")) or name == "META-INF/MANIFEST.MF"):
                continue
            content = original.read(entry)
            if name.startswith("lib/"):
                if not name.startswith(f"lib/{abi}/"):
                    raise ValueError(f"Unexpected native ABI: {name}")
                if name.endswith("/libpybundle.so"):
                    content, removed, bundled = finalize_bundle(content, abi)
                    native += bundled
                elif name.endswith(".so"):
                    validate_elf(name, content, abi)
                    native += 1
            output.writestr(entry, content)
    if native == 0:
        raise ValueError("APK native libraries absent")
    return {"abi": abi, "native_libraries_checked": native,
            "optional_speedups_removed": removed, "unsigned_apk": destination.name}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--abi", choices=list(MACHINES), required=True)
    args = parser.parse_args()
    print(json.dumps(finalize(args.input, args.output, args.abi)))

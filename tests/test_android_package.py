import io
import struct
import tarfile

import pytest

from tools.finalize_android import SPEEDUPS, finalize_bundle, validate_elf


def elf(machine: int = 183, alignment: int = 16384) -> bytes:
    data = bytearray(120)
    data[:6] = b"\x7fELF\x02\x01"
    struct.pack_into("<H", data, 18, machine)
    struct.pack_into("<Q", data, 32, 64)
    struct.pack_into("<HH", data, 54, 56, 1)
    struct.pack_into("<IIQQQQQQ", data, 64, 1, 5, 0, 0, 0, 120, 120, alignment)
    return bytes(data)


def bundle(files: dict[str, bytes]) -> bytes:
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode="w:gz") as archive:
        for name, data in files.items():
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    return result.getvalue()


def test_optional_host_speedups_removed_with_python_fallback_preserved() -> None:
    fallback = "_python_bundle/site-packages/markupsafe/_native.pyc"
    native = "_python_bundle/modules/_sqlite3.so"
    result, removed, count = finalize_bundle(bundle({
        SPEEDUPS: elf(62), fallback: b"fallback fixture", native: elf(),
    }), "arm64-v8a")
    with tarfile.open(fileobj=io.BytesIO(result), mode="r:gz") as archive:
        assert SPEEDUPS not in archive.getnames()
        assert archive.extractfile(fallback).read() == b"fallback fixture"
        assert archive.extractfile(native).read() == elf()
    assert removed == 1 and count == 1


def test_required_library_wrong_abi_rejected() -> None:
    with pytest.raises(ValueError, match="Wrong ABI"):
        finalize_bundle(bundle({"_python_bundle/modules/required.so": elf(62)}), "arm64-v8a")


def test_arm64_library_without_16kib_alignment_rejected() -> None:
    with pytest.raises(ValueError, match="alignment"):
        validate_elf("required.so", elf(alignment=4096), "arm64-v8a")


def test_optional_speedups_cannot_be_removed_without_fallback() -> None:
    with pytest.raises(ValueError, match="fallback missing"):
        finalize_bundle(bundle({SPEEDUPS: elf(62)}), "arm64-v8a")

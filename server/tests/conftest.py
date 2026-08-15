from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_KEY = "test-passphrase"


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the app at a throwaway database and set the passphrase."""
    from app import config

    path = tmp_path / "test.db"
    monkeypatch.setattr(config, "DATABASE_PATH", path)
    monkeypatch.setattr(config, "BJJ_KEY", TEST_KEY)
    return path


@pytest.fixture
def conn(db_path: Path) -> Iterator[sqlite3.Connection]:
    """A migrated connection to the throwaway database."""
    from app import db as db_module

    connection = db_module.connect(db_path)
    db_module.migrate(connection)
    try:
        yield connection
    finally:
        connection.close()


@pytest.fixture
def client(db_path: Path) -> Iterator[TestClient]:
    """Test client with the passphrase header pre-attached."""
    from app.main import app

    with TestClient(app) as test_client:
        test_client.headers.update({"X-BJJ-Key": TEST_KEY})
        yield test_client

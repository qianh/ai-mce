from app.models import Base, Capture, RefreshToken, User


def test_cloud_tables_are_declared():
    assert {"users", "refresh_tokens", "captures"} <= set(Base.metadata.tables)

    assert User.__tablename__ == "users"
    assert RefreshToken.__tablename__ == "refresh_tokens"
    assert Capture.__tablename__ == "captures"


def test_capture_table_contains_user_scoped_payload_columns():
    columns = Capture.__table__.columns

    for name in [
        "id",
        "user_id",
        "source_platform",
        "source_url",
        "source_title",
        "content_hash",
        "source_fingerprint",
        "extraction_quality",
        "messages",
        "metadata",
        "analysis_status",
        "created_at",
        "updated_at",
    ]:
        assert name in columns


def test_capture_indexes_support_user_scoped_access_and_upsert():
    indexes = {index.name: index for index in Capture.__table__.indexes}

    assert "ix_captures_user_created_at" in indexes
    assert [column.name for column in indexes["ix_captures_user_created_at"].columns] == [
        "user_id",
        "created_at",
    ]

    fingerprint_index = indexes["uq_captures_user_source_fingerprint"]
    assert fingerprint_index.unique is True
    assert [column.name for column in fingerprint_index.columns] == [
        "user_id",
        "source_fingerprint",
    ]

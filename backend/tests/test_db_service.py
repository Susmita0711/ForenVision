from services.db import mask_mongo_uri, DatabaseService


def test_mask_mongo_uri_removes_passwords():
    """Verify that credentials in connection strings are always masked."""
    # Standard Atlas SRV connection string
    uri1 = "mongodb+srv://admin_user:P@ssw0rd123!@cluster0.abcde.mongodb.net/forenvision_db?retryWrites=true"
    masked1 = mask_mongo_uri(uri1)
    assert "admin_user" not in masked1
    assert "P@ssw0rd123!" not in masked1
    assert masked1.startswith("mongodb+srv://***:***@cluster0.abcde.mongodb.net/")

    # Standard direct connection with IP and port
    uri2 = "mongodb://forensic_analyst:SecretVaultKey99@10.0.1.50:27017/evidence_vault"
    masked2 = mask_mongo_uri(uri2)
    assert "forensic_analyst" not in masked2
    assert "SecretVaultKey99" not in masked2
    assert masked2.startswith("mongodb://***:***@10.0.1.50:27017/")

    # Empty string handling
    assert mask_mongo_uri("") == ""


def test_db_service_unconfigured_defaults():
    """Verify DatabaseService sets correct defaults when unconfigured."""
    service = DatabaseService()
    assert service.status == "unconfigured"
    assert service.get_db() is None
    assert service.is_connected() is False

    status_dict = service.get_status()
    assert status_dict["status"] == "unconfigured"
    assert status_dict["name"] is None
    assert status_dict["masked_uri"] is None


def test_db_service_close_is_idempotent():
    """Verify closing DatabaseService when not connected is safe."""
    service = DatabaseService()
    service.close()
    assert service.status == "disconnected"
    assert service.client is None

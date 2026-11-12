from config import get_config, DevelopmentConfig, TestingConfig, ProductionConfig


def test_development_config():
    cfg = get_config("development")
    assert issubclass(cfg, DevelopmentConfig)
    assert cfg.DEBUG is True
    assert cfg.TESTING is False


def test_testing_config():
    cfg = get_config("testing")
    assert issubclass(cfg, TestingConfig)
    assert cfg.TESTING is True
    assert cfg.MONGO_DB_NAME == "forenvision_test_db"


def test_production_config():
    cfg = get_config("production")
    assert issubclass(cfg, ProductionConfig)
    assert cfg.DEBUG is False
    assert cfg.TESTING is False


def test_default_config_fallback():
    cfg = get_config("unknown_environment")
    assert issubclass(cfg, DevelopmentConfig)

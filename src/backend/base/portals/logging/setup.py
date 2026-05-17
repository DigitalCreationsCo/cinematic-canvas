from px.log.logger import logger

LOGGING_CONFIGURED = False


def disable_logging() -> None:
    global LOGGING_CONFIGURED  # noqa: PLW0603
    if not LOGGING_CONFIGURED:
        logger.disable("portals")
        LOGGING_CONFIGURED = True


def enable_logging() -> None:
    global LOGGING_CONFIGURED  # noqa: PLW0603
    logger.enable("portals")
    LOGGING_CONFIGURED = True

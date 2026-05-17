# celeryconfig.py
import os

portals_redis_host = os.environ.get("PORTALS_REDIS_HOST")
portals_redis_port = os.environ.get("PORTALS_REDIS_PORT")
# broker default user

if portals_redis_host and portals_redis_port:
    broker_url = f"redis://{portals_redis_host}:{portals_redis_port}/0"
    result_backend = f"redis://{portals_redis_host}:{portals_redis_port}/0"
else:
    # RabbitMQ
    mq_user = os.environ.get("RABBITMQ_DEFAULT_USER", "portals")
    mq_password = os.environ.get("RABBITMQ_DEFAULT_PASS", "portals")
    broker_url = os.environ.get("BROKER_URL", f"amqp://{mq_user}:{mq_password}@localhost:5672//")
    result_backend = os.environ.get("RESULT_BACKEND", "redis://localhost:6379/0")
# tasks should be json or pickle
accept_content = ["json", "pickle"]

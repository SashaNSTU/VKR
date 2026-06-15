"""
HTTP-утилиты: вытаскивание клиентского IP с поддержкой прокси/тестового заголовка.
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """
    Возвращает IP клиента.

    Приоритет:
    1. X-Test-IP — заголовок для BAS-тестирования (имитация «разных IP»
       при запуске с одного хоста). Использовать только в DEBUG-окружении.
    2. X-Forwarded-For — стандартный заголовок прокси.
    3. request.client.host — fallback.
    """
    test_ip = request.headers.get("X-Test-IP")
    if test_ip:
        return test_ip.strip()

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.client.host or "unknown"

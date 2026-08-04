from google.genai import errors


class QuotaExceededError(Exception):
    pass


# thin wrapper around a Gemini API call
class RateLimitGuard:
    def __init__(self, name):
        self.name = name

    def call(self, api_function, *args, **kwargs):
        try:
            return api_function(*args, **kwargs)
        except errors.APIError as e:
            if e.code == 429:
                raise QuotaExceededError(
                    f"[{self.name}] Google's API reports the quota is exceeded: {e.message}"
                ) from e
            raise

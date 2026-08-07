class QuotaExceededError(Exception):
    pass


# translates an already-caught errors.APIError into QuotaExceededError if it
# was a 429, re-raises as-is otherwise. name identifies which caller hit it
# ("llm" / "eval" / "embedding") so a 429 in the logs says which quota bucket
def raise_on_quota_exceeded(e, name):
    if e.code == 429:
        raise QuotaExceededError(
            f"[{name}] Google's API reports the quota is exceeded: {e.message}"
        ) from e
    raise e

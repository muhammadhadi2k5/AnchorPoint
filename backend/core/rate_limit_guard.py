class QuotaExceededError(Exception):
    pass


# name ("llm"/"eval"/"embedding") just labels which caller hit the 429, so the logs say
# which quota bucket ran out instead of just "something did"
def raise_on_quota_exceeded(e, name):
    if e.code == 429:
        raise QuotaExceededError(
            f"[{name}] Google's API reports the quota is exceeded: {e.message}"
        ) from e
    raise e

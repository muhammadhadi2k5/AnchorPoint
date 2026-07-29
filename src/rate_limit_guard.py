import json
from pathlib import Path
from datetime import date
from google.genai import errors


class QuotaExceededError(Exception):
    pass


# stops me from blowing past the free tier daily limit by mistake while
# testing. tracks usage in a local json file, resets automatically at
# midnight
class RateLimitGuard:
    def __init__(self, name, daily_limit=500):
        self.name = name
        self.daily_limit = daily_limit
        self.state_file = Path(f"data/.rate_limit_{name}.json")

    def _load_state(self):
        if not self.state_file.exists():
            return {"date": str(date.today()), "count": 0}

        with open(self.state_file, "r", encoding="utf-8") as f:
            state = json.load(f)

        if state.get("date") != str(date.today()):  
            return {"date": str(date.today()), "count": 0}

        return state

    def _save_state(self, state):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(state, f)

    # call this before hitting the API. count = how many quota units this
    # one request actually uses - not 1 per API call, since google counts
    # each text in a batch separately
    def check_and_increment(self, count=1):
        state = self._load_state()

        if state["count"] + count > self.daily_limit:
            raise QuotaExceededError(
                f"[{self.name}] This request ({count} unit(s)) would exceed the daily limit "
                f"({state['count']}/{self.daily_limit} used so far). Refusing to send it to "
                f"avoid exceeding the free tier. Check your real usage/limits at "
                f"https://aistudio.google.com/rate-limit"
            )

        state["count"] += count
        self._save_state(state)

    # does the local check first, then also catches google's own 429 if we
    # somehow hit that anyway (local count being off, clock skew, whatever)
    def call(self, api_function, *args, count=1, **kwargs):
        self.check_and_increment(count=count)

        try:
            return api_function(*args, **kwargs)
        except errors.APIError as e:
            if e.code == 429:
                raise QuotaExceededError(
                    f"[{self.name}] Google's API reports the quota is exceeded: {e.message}"
                ) from e
            raise

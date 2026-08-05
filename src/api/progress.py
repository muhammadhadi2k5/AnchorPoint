import threading

# ingestion runs on a background thread while the API polls it from the
# request thread, so this needs an actual lock, not just a plain dict
_lock = threading.Lock()
_store = {}


def set_progress(
    dataset_id, message, filename=None, done=False, error=None,
    kind=None, file_index=None, file_total=None,
):
    with _lock:
        _store[dataset_id] = {
            "message": message,
            "filename": filename,
            "done": done,
            "error": error,
            "kind": kind,
            "file_index": file_index,
            "file_total": file_total,
        }


def get_progress(dataset_id):
    with _lock:
        return _store.get(dataset_id)


def clear_progress(dataset_id):
    with _lock:
        _store.pop(dataset_id, None)

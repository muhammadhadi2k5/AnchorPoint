import bcrypt

from api import db

SESSION_COOKIE = "session_id"
SESSION_TTL_DAYS = 30


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def set_session_cookie(response, session_id):
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        max_age=60 * 60 * 24 * SESSION_TTL_DAYS,
        httponly=True,
        samesite="lax",
    )


def clear_session_cookie(response):
    response.delete_cookie(SESSION_COOKIE)


def get_current_user_id(request):
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id:
        return None
    return db.get_session_user_id(session_id)

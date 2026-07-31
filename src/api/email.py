import os

import resend

resend.api_key = os.environ.get("RESEND_API_KEY")

# resend's shared sandbox sender - works immediately with no domain setup,
# swap for a verified "from" address on your own domain before sharing this
# with anyone outside your own Resend account
FROM_ADDRESS = "AnchorPoint <anchorpoint@resend.dev>"


# delivery failing shouldn't break signup/login - the account and code
# already exist in the db by the time this runs, so a bounced/rejected
# email should just mean "resend verification" later, not a 500 that
# leaves an orphaned account the client thinks never got created
def _send(to_email, subject, body_html):
    try:
        resend.Emails.send({
            "from": FROM_ADDRESS,
            "to": [to_email],
            "subject": subject,
            "html": body_html,
        })
    except Exception as e:
        print(f"[email] failed to send to {to_email}: {e}")


def send_verification_email(to_email, code):
    _send(
        to_email,
        "Verify your email for AnchorPoint",
        f"""
        <p>Your AnchorPoint verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{code}</p>
        <p>This code expires in 15 minutes.</p>
        """,
    )


def send_password_reset_email(to_email, code):
    _send(
        to_email,
        "Reset your AnchorPoint password",
        f"""
        <p>Your AnchorPoint password reset code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">{code}</p>
        <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
        """,
    )

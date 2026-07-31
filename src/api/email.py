import os

import resend

resend.api_key = os.environ.get("RESEND_API_KEY")

# resend's shared sandbox sender - works immediately with no domain setup,
# swap for a verified "from" address on your own domain before sharing this
# with anyone outside your own Resend account
FROM_ADDRESS = "AnchorPoint <onboarding@resend.dev>"


def _send(to_email, subject, body_html):
    resend.Emails.send({
        "from": FROM_ADDRESS,
        "to": [to_email],
        "subject": subject,
        "html": body_html,
    })


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

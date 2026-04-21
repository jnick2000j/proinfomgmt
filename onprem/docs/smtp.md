# SMTP Configuration

SMTP is required for:

- New user invitations
- Password reset emails
- MFA challenges (when email factor enabled)
- Weekly report digests
- Notification emails

## Configuration

Set in `.env`:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=<app-password>
SMTP_FROM="TaskMaster <notifications@example.com>"
SMTP_TLS=true
```

`auth` and `edge` both read SMTP env vars at boot. After changing them:

```bash
docker compose restart auth edge
```

## Common providers

### SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=<sendgrid-api-key>
```

### AWS SES

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<smtp-username-from-iam>
SMTP_PASSWORD=<smtp-password-from-iam>
```

### Postfix relay (on-host)

```env
SMTP_HOST=host.docker.internal
SMTP_PORT=25
SMTP_USER=
SMTP_PASSWORD=
SMTP_TLS=false
```

## DKIM / SPF / DMARC

Configure these on the **sending domain** (the domain in `SMTP_FROM`),
not on the install host. Without proper records, deliverability to Gmail
and Outlook will be poor.

## Testing

Trigger a password reset for any user. Check `docker compose logs auth | grep -i smtp`
for the delivery attempt. Common errors:

- `535 5.7.8` — wrong username/password
- `554 5.7.1` — sending domain not authorized (DKIM/SPF missing)
- `connect timeout` — host firewall blocks outbound 587

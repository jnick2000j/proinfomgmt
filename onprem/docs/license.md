# License Management

TaskMaster on-prem requires an active license. Licenses are JWTs signed by
the TaskMaster platform private key and verified locally by every install
against the embedded `keys/license.pub.pem`.

## Installing a license

Set `LICENSE_KEY` in `.env` and run `./scripts/install.sh` (first install)
or restart the stack with `docker compose restart edge`.

You can also paste the license into **Platform Admin → Licenses → Install
license** as an authenticated platform admin. The UI calls
`set_license_status` which re-verifies the signature server-side.

## License entitlements

Each license declares:

- `deployment_mode`: `cloud`, `on_prem`, or `hybrid`
- `seats`: max active users (`-1` = unlimited)
- `ai_credits_monthly`: AI credit cap (`-1` = unlimited, the on-prem default)
- `features_override`: a JSON map of feature flags to force on/off
- `valid_from` / `valid_until`: validity window
- `customer_reference`: human-readable identifier shown in admin badges

When an active license exists:

- The Stripe checkout/billing flow is hidden — see `useDeploymentMode.tsx`.
- AI credits default to unlimited (or the license-declared cap).
- Feature flags from `features_override` win over plan defaults.
- Pricing pages show a "Managed via license" notice for signed-in users.

## Rotating

Issue a new license with overlapping validity, install it, then expire the old
one via **Platform Admin → Licenses → Set status = expired**. The system
always uses the most recently issued active license.

## Revoking

Set status to `revoked` from the Platform Admin UI or call
`set_license_status(<id>, 'revoked', '<reason>')` directly. The next call to
`get_license_entitlements` will return `has_license: false`, dropping the
install back to a degraded read-only mode (no new writes, existing data
remains accessible). UI surfaces a warning banner.

## Air-gapped key updates

If we rotate the platform signing key, you'll receive a new
`license.pub.pem` along with the next bundle. The upgrade script
automatically swaps it; no manual steps required.

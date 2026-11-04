# Zendesk

Connect each Zendesk account at its own site. The host validates a single Zendesk subdomain and saves its HTTPS origin with the account. Authorization, refresh, health checks and API requests use that saved site.

## API and approval

The app keeps its current-user and ticket shortcuts and adds the operations from Zendesk's official Support API v2 OpenAPI document. Reads run without approval. Every imported mutation and the createTicket shortcut require approval. Zendesk still enforces each user's role and plan permissions.

The API router uses the saved site's exact origin as both its base URL and allowed origin. Requests cannot use another Zendesk tenant or a caller-supplied host.

## OAuth

The host-managed public OAuth client is available when configured. Each person can still use a custom client under Advanced. The app requests Zendesk's broad `read`, `write` and `impersonate` OAuth scopes. The host retains client secrets and refresh tokens; the app does not include client values.

## Marketplace requests

When the deployment has assigned publisher metadata, the catalog injects the required Zendesk Marketplace headers into requests to the saved Zendesk site. Catalog query parameters cannot set or change those values.

## Brand asset

The catalog listing and app package use the Z mark from Zendesk's primary logo in its [brand guidelines](https://web-assets.zendesk.com/zendesk/pages/company/brand-guidelines/primarylogo.png), cropped to the mark, with a white variant for dark themes.

## Evidence limits

The saved-site, OAuth, approval and routing proof uses synthetic Zendesk sites. It does not establish live consent, Marketplace approval, or access to any customer's site.

## References

- [Zendesk Support API OpenAPI document](https://developer.zendesk.com/zendesk/oas.yaml)
- [Zendesk OAuth scopes](https://developer.zendesk.com/api-reference/ticketing/introduction/#oauth-scopes)
- [OAuth PKCE](https://developer.zendesk.com/documentation/authentication/oauth-pkce/)
- [Refresh tokens](https://developer.zendesk.com/documentation/authentication/refresh-token/)
- [Marketplace request headers](https://developer.zendesk.com/documentation/marketplace/building-a-marketplace-app/request-header-requirements-for-marketplace-apps/)

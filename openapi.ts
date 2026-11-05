import type { OpenapiToolNamesOptions } from "apps/openapi";

// Both declared schemes use the saved provider account's OAuth bearer token.
export function optionsFor(site: string) {
  return {
    source: { url: "https://developer.zendesk.com/zendesk/oas.yaml" },
    allowedOrigin: site,
    baseUrl: site,
    securitySchemes: {
      basicAuth: { type: "http", scheme: "bearer" },
      oauth2: { type: "http", scheme: "bearer" },
    },
    methods: {
      oauth: [
        { scheme: "basicAuth", field: "access_token", part: "value", prefix: "" },
        { scheme: "oauth2", field: "access_token", part: "value", prefix: "" },
      ],
    },
    oauth: [],
  } satisfies OpenapiToolNamesOptions;
}

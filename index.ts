import {
  array,
  bearer,
  decodeJson,
  defineApp,
  defineProvider,
  mutation,
  number,
  object,
  oauth2,
  query,
  router,
  string,
  type Infer,
  type QueryContext,
  type Schema as AppSchema,
  withApprovals,
} from "apps";
import { always, never } from "apps/operations/approval";
import { liveOpenapiRouter } from "apps/openapi";
import { integrationHeaders } from "./configuration.ts";
import { icons } from "./icon.js";
import { optionsFor } from "./openapi.js";

const scopes = ["read", "write"] as const;

const ZendeskUser = object({ id: number(), name: string() });
const CurrentUserResponse = object({ user: ZendeskUser });

const ZendeskTicket = object({
  id: number(),
  subject: string(),
  status: string(),
  created_at: string(),
  updated_at: string(),
});
const TicketListResponse = object({ tickets: array(ZendeskTicket) });
const TicketResponse = object({ ticket: ZendeskTicket });

const UserOutput = object({ id: number(), name: string() });
const TicketOutput = object({
  id: number(),
  subject: string(),
  status: string(),
  createdAt: string(),
  updatedAt: string(),
});
const TicketListOutput = object({
  tickets: array(TicketOutput),
  page: number(),
  perPage: number(),
});

type ZendeskAccount = {
  readonly site?: string;
  headers(): HeadersInit;
  url(url: string): string;
};
type AppFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function requestJson<T>(
  fetch: AppFetch,
  signal: AbortSignal,
  account: ZendeskAccount,
  url: string,
  schema: AppSchema<T, boolean>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(account.headers());
  headers.set("accept", "application/json");
  for (const [name, value] of Object.entries(integrationHeaders)) headers.set(name, value);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  const response = await fetch(account.url(url), {
    ...init,
    headers,
    redirect: "manual",
    signal,
  });
  return decodeJson(response, schema);
}

function marketplaceFetch(site: string, fetch: AppFetch): AppFetch {
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin !== site) return fetch(input, init);

    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    for (const [name, value] of Object.entries(integrationHeaders)) headers.set(name, value);
    return fetch(input, { ...init, headers, redirect: "manual" });
  };
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function ticketOutput(ticket: Infer<typeof ZendeskTicket>) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

function accountOrigin(account: ZendeskAccount): string {
  if (account.site === undefined) throw new Error("Reconnect this account and select its Zendesk site.");
  return account.site;
}

const declarationOrigin = "https://example.zendesk.com";
const zendesk = defineProvider({
  name: "Zendesk",
  hosts: ["example.zendesk.com"],
  site: { label: "Zendesk site", origin: declarationOrigin, subdomainOf: "zendesk.com" },
  auth: {
    oauth: oauth2({
      authorizationUrl: `${declarationOrigin}/oauth/authorizations/new`,
      tokenUrl: `${declarationOrigin}/oauth/tokens`,
      scopes: [...scopes],
      tokenRequestFormat: "json",
      confidentialTokenEndpointAuthMethod: "client_secret_post",
      request: ({ access_token }) => bearer(access_token),
    }),
  },
  health: async ({ account, fetch, signal }) => {
    const { user } = await requestJson(
      fetch,
      signal,
      account,
      `${accountOrigin(account)}/api/v2/users/me.json`,
      CurrentUserResponse,
    );
    return {
      accountInfo: { externalId: String(user.id), displayName: user.name },
    };
  },
});

const requirements = { user: { accounts: { zendesk } } };
type Context = QueryContext<typeof requirements>;

const currentUser = query(
  {
    description: "Show the Zendesk user connected to this account.",
    input: object({}),
    output: UserOutput,
    approval: never(),
  },
  async ({ user, fetch, signal }: Context) => {
    const { user: current } = await requestJson(
      fetch,
      signal,
      user.accounts.zendesk,
      `${accountOrigin(user.accounts.zendesk)}/api/v2/users/me.json`,
      CurrentUserResponse,
    );
    return { id: current.id, name: current.name };
  },
);

const listTickets = query(
  {
    description: "List a page of tickets visible to the connected Zendesk user.",
    input: object({ page: number().optional().default(1), perPage: number().optional().default(25) }),
    output: TicketListOutput,
    approval: never(),
  },
  async ({ user, fetch, signal }: Context, input) => {
    const page = positiveInteger(input.page ?? 1, "page");
    const perPage = Math.min(100, positiveInteger(input.perPage ?? 25, "perPage"));
    const url = new URL(`${accountOrigin(user.accounts.zendesk)}/api/v2/tickets.json`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const result = await requestJson(
      fetch,
      signal,
      user.accounts.zendesk,
      url.href,
      TicketListResponse,
    );
    return { tickets: result.tickets.map(ticketOutput), page, perPage };
  },
);

const getTicket = query(
  {
    description: "Get one Zendesk ticket by its numeric ID.",
    input: object({ ticketId: number() }),
    output: TicketOutput,
    approval: never(),
  },
  async ({ user, fetch, signal }: Context, { ticketId }) => {
    const id = positiveInteger(ticketId, "ticketId");
    const { ticket } = await requestJson(
      fetch,
      signal,
      user.accounts.zendesk,
      `${accountOrigin(user.accounts.zendesk)}/api/v2/tickets/${id}.json`,
      TicketResponse,
    );
    return ticketOutput(ticket);
  },
);

const createTicket = mutation(
  {
    description: "Create a Zendesk ticket. Every call requires human approval.",
    input: object({
      subject: string({ minLength: 1 }),
      comment: string({ minLength: 1 }),
      requesterId: number().optional(),
    }),
    output: TicketOutput,
    approval: always(),
  },
  async ({ user, fetch, signal }: Context, input) => {
    const requesterId =
      input.requesterId === undefined
        ? undefined
        : positiveInteger(input.requesterId, "requesterId");
    const body = {
      ticket: {
        subject: input.subject,
        comment: { body: input.comment },
        ...(requesterId === undefined ? {} : { requester_id: requesterId }),
      },
    };
    const { ticket } = await requestJson(
      fetch,
      signal,
      user.accounts.zendesk,
      `${accountOrigin(user.accounts.zendesk)}/api/v2/tickets.json`,
      TicketResponse,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return ticketOutput(ticket);
  },
);

export default defineApp({ ...requirements, icons }, async ({ user, cache, fetch, signal }) => {
  const account = user?.accounts.zendesk;
  const api =
    account === undefined
      ? router({})
      : router(
          withApprovals(
            liveOpenapiRouter({
              ...optionsFor(accountOrigin(account)),
              cache,
              fetch: marketplaceFetch(accountOrigin(account), fetch),
              signal,
              account,
            }),
            (tool) => (tool.kind === "mutation" ? always() : undefined),
          ),
          {
            title: "Zendesk Support API v2",
            description:
              "The Zendesk Support API v2. Zendesk account roles and plan limits apply; every mutation requires approval.",
          },
        );

  return {
    tools: router({
      currentUser,
      listTickets,
      getTicket,
      createTicket,
      api,
    }),
  };
});

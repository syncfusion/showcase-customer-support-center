# Customer Support SLA Showcase

A customer support command center built as a Syncfusion reference application. It pairs an ASP.NET Core Web API with a Syncfusion-powered React 19 client to give support teams a real-time view of tickets, queues, cases, automation rules, and SLA performance — all driven by deterministic seed data so the experience is consistent for stakeholders and reviewers.

The application demonstrates how a customer support organization can bring live SLA tracking, case management, queue assignment, AI-assisted triage and reply drafting, and automation rules into one responsive workspace. It showcases how Syncfusion UI components and Syncfusion Code Studio accelerate enterprise application development.

> This is a showcase application with deterministic sample data. It is not intended to be used as a production customer support platform without adding production authentication, authorization, auditing, secrets management, and operational controls.

## What the showcase includes

- **Overview** workspace with SLA KPIs, channel mix, breach alerts, and at-risk tickets
- **Queue** with live ticket counts, tier filters, ticket creation, and assignment flows
- **Cases** with detail view, replies, notes, resolve, reassign, and escalate actions
- **Automation** rules, routing policies, SLA policies, escalation workflows, macros, and impact reports
- Hash-based navigation shell with grouped Operate / Manage sections, dark mode, error boundaries, and accessible navigation
- Deterministic seed data backed by PostgreSQL (Azure Postgres Flexible Server)

## Technology

| Layer | Technology |
| --- | --- |
| API | ASP.NET Core Web API on .NET 10, minimal-API endpoints |
| Data | Entity Framework Core with Npgsql (Azure PostgreSQL Flexible Server) |
| React client | React 19, TypeScript, Vite, Syncfusion React UI 34.x, lucide-react |
| Static hosting | Lightweight Node/Express-style `server.cjs` for the React build (serves on port `8080` under `/customer-support-sla/react`) |

The UI implementation uses Syncfusion components such as DataGrid, Charts, Dialogs, Inputs, DropDowns, Buttons, Sidebar, Tabs, ProgressBar, and Notifications (Toast/Spinner).

## Why Syncfusion Code Studio and UI components?

This repository is a practical proof of how [Syncfusion Code Studio](https://www.syncfusion.com/code-studio/) and the [Syncfusion component ecosystem](https://www.syncfusion.com/) can accelerate component-rich enterprise development.

- Code Studio can help teams plan features, generate and refine code, debug issues, and create tests with awareness of the existing codebase.
- Production-oriented UI components reduce the amount of custom code required for advanced grids, charts, workflows, dialogs, theming, and real-time data displays.
- Built-in capabilities such as filtering, grouping, paging, export, responsive rendering, accessibility, and theming help teams focus on business workflows rather than foundational UI infrastructure.
- A single API surface serves multiple client types, making it easy to adapt the same backend experience across different frontend frameworks.

## Repository structure

```text
Customer-support-hosting/
├── webapi/                                # ASP.NET Core Web API (.NET 10)
│   ├── CustomerSupportSla.slnx
│   └── src/
│       ├── CustomerSupportSla.Api/        # Minimal API host + endpoints + launch settings
│       │   ├── Program.cs                 # DI, CORS, endpoint mapping, 404 fallback
│       │   ├── endpoints/                 # Ai, Automation, Cases, Lookups, Overview, Queue
│       │   ├── Serialization/             # StringEnumConverter for compact JSON
│       │   ├── Properties/launchSettings.json   # Default dev URL: http://localhost:5271
│       │   ├── appsettings.json           # ConnectionStrings (Postgres), Cors
│       │   └── wwwroot/                   # 404.html + index.html fallback
│       ├── CustomerSupportSla.Application/   # DTOs, repository + service contracts
│       └── CustomerSupportSla.Infrastructure/ # DbContext, EF entities, repositories, seed
└── react/                                 # React 19 + Vite client
    ├── server.cjs                         # Node static server: serves `dist/` on :8080 at /customer-support-sla/react
    ├── src/
    │   ├── App.tsx                        # ThemeProvider + AppShell
    │   ├── basePath.ts                    # Single source of truth for the '/customer-support-sla/react' mount path
    │   ├── navigation/                    # NavItem + grouped Operate/Manage nav items
    │   ├── shell/                         # AppShell, Sidebar, Topbar, tabs (Overview/Queue/Cases/Automation/Insights)
    │   ├── api/                           # automationClient, casesClient, overviewClient, queueClient
    │   ├── data/                          # caseDetails + tickets reference data
    │   ├── datamodels/                    # Plain-text shape docs per tab
    │   ├── hooks/                         # useAutomationData, useOverviewData, usePersistedState
    │   ├── styles/tabs/                   # Per-tab CSS
    │   ├── theme/                         # ThemeProvider, tokens.css, useTheme hook
    │   └── index.css / main.tsx
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json                      # + tsconfig.app.json / tsconfig.node.json
    └── package.json
```

## Run locally

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download) (the API targets `net10.0`)
- A current Node.js LTS release and npm
- A reachable PostgreSQL instance (defaults point to the project's Azure Flexible Server)
- A valid Syncfusion license or trial where required

### 1. Start the Web API

The API expects an explicit `ConnectionStrings:CustomerSupport` value — set it in [webapi/src/CustomerSupportSla.Api/appsettings.json](webapi/src/CustomerSupportSla.Api/appsettings.json), `appsettings.Development.json`, user secrets, or environment variables before starting. The default points at the project's Azure PostgreSQL Flexible Server:

```json
{
  "ConnectionStrings": {
    "CustomerSupport": "Host=localhost;Port=5432;Database=supply_chain;Username=postgres;Password=password"
  }
  },
  "Cors": {
    "Policies": {
      "AllowReactApp": {
        "Origins": [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:5174",
          "http://127.0.0.1:5174",
          "http://localhost:5175",
          "http://127.0.0.1:5175",
          "http://localhost:4200",
          "http://127.0.0.1:4200",
          "http://localhost:5197",
          "http://127.0.0.1:5197",
          "http://localhost:5176",
          "http://127.0.0.1:5176"
        ],
        "AllowCredentials": true,
        "AllowAnyHeader": true,
        "AllowAnyMethod": true
      }
    }
  }
}
```

Then start the API:

```bash
cd webapi
dotnet restore
dotnet run --project src/CustomerSupportSla.Api/CustomerSupportSla.Api.csproj
```

The API exposes:

- HTTP — `http://localhost:5271` (default from `Properties/launchSettings.json`)
- Liveness — `GET /health`
- OpenAPI — `/openapi/v1.json` in `Development`

CORS is preconfigured for the React dev servers listed above. Update `Cors:Policies:AllowReactApp:Origins` in [appsettings.json](webapi/src/CustomerSupportSla.Api/appsettings.json) to add more.

### 2. Start the React client

```bash
cd react
npm install
npm run dev
```

- Vite dev server runs at `http://localhost:5173` (or the next available port) and reads `VITE_API_BASE_URL` from `.env.development` (defaults to `http://localhost:5271`).
- The app is built to be served from the **`/customer-support-sla/react`** base path so the same `dist/` works behind a vanity path ([react/src/basePath.ts](react/src/basePath.ts)) and directly from origin.

### 3. (Optional) Serve the built React app from the Node static server

```bash
cd react
npm run build
npm start            # node server.cjs, listens on 0.0.0.0:8080 under /customer-support-sla/react
```

This is what production hosts (App Service, container images, etc.) use. The browser-side Syncfusion license can be injected either at build time via `VITE_SYNCFUSION_LICENSE` in `.env.local` or at runtime by editing `wwwroot/config.js`.

## Workspace navigation

The React shell uses hash-based routing grouped into two sections:

| Group | Tab | Description |
| --- | --- | --- |
| Operate | **Overview** | SLA KPIs, channel mix, breach alerts, at-risk tickets, activity feed |
| Operate | **Queue** | Live ticket queue with tier filters, agent list, ticket create + assign |
| Operate | **Cases** | Case list and detail with replies, notes, resolve, reassign, escalate |
| Operate | **Automation** | Routing rules, SLA policies, escalation workflows, macros, impact report |
| Operate | **Insights** | AI-assisted summaries and trend insights (placeholder tab) |
| Manage | **Teams / Knowledge / Schedules** | Placeholder navigation entries reserved for future expansion |

## API surface

Base URL: `http://localhost:5271/api`

| Area | Prefix | Endpoints |
| --- | --- | --- |
| Overview | `/api/overview` | `GET /kpis`, `GET /trend`, `GET /channel-mix`, `GET /activity`, `GET /workload`, `GET /agent-workload`, `GET /at-risk-tickets`, `GET /breach-alert`, `GET /filter-options`, `POST /employee/{id}/generate-insight`, `POST /breach-alert/reassign`, `POST /tickets/{ticketId}/reassign`, `POST /tickets/bulk-escalate`, `POST /tickets/{ticketId}/notes`, `POST /tickets/{ticketId}/close-duplicate` |
| Queue | `/api/queue` | `GET /tickets`, `GET /views`, `GET /summary`, `GET /filter-options`, `GET /agents`, `POST /tickets` |
| Cases | `/api/cases` | `GET /`, `GET /default`, `GET /lookup`, `GET /{id}`, `POST /{id}/resolve`, `POST /{id}/reassign`, `POST /{id}/escalate`, `POST /{id}/replies`, `POST /{id}/notes` |
| Automation | `/api/automation` | `GET /routing-rules`, `GET /sla-policies`, `GET /escalation-workflows/{id}`, `GET /macros`, `GET /impact` |
| Lookups | `/api/lookups` | `GET /{set}` |
| AI | `/api/ai` | `POST /triage-suggest`, `POST /reply-draft` |
| Health | `/health` | `GET /` — liveness probe |

## Build

```bash
# API
cd webapi
dotnet build

# React
cd ../react
npm run build
```

## Resetting demo data

To reset the data to seed state, restore the schema on the target PostgreSQL instance and restart the API service. The seeder lives under [`webapi/src/CustomerSupportSla.Infrastructure/Persistence/Seed`](webapi/src/CustomerSupportSla.Infrastructure/Persistence) and the deterministic base data is loaded from the same project on startup.

## Licensing

Syncfusion packages are governed by Syncfusion's licensing terms. Review the [Syncfusion licensing documentation](https://www.syncfusion.com/sales/licensing) before redistributing or deploying the applications. Publishing this source repository does not grant a license to Syncfusion products.

## Intended audience

This showcase is useful for engineering leaders, architects, product teams, and developers evaluating how a modern customer support workspace can be implemented with a shared API and enterprise web frameworks like React, with Syncfusion components delivering production-ready UI and data-binding capabilities.
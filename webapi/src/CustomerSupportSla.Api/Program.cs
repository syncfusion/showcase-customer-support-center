using System.Linq;
using CustomerSupportSla.Api.Endpoints;
using CustomerSupportSla.Api.Serialization;
using CustomerSupportSla.Infrastructure.Persistence.Seed;
using Microsoft.AspNetCore.Http.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.WithStringEnums();
});

// Require an explicit PostgreSQL connection string. Falls back would
// silently resurrect the legacy local SQLite file, which would then
// crash on `UseNpgsql(...)` below — fail fast at boot instead.
var connectionString = builder.Configuration.GetConnectionString("CustomerSupport")
    ?? throw new InvalidOperationException(
        "Connection string 'ConnectionStrings:CustomerSupport' is not configured. " +
        "Set it in appsettings.json, appsettings.Development.json, " +
        "user secrets, or environment variables before starting the API.");

builder.Services.AddSlaInfrastructure(connectionString);

builder.Services.AddCors(options =>
{
    var policySection = builder.Configuration.GetSection("Cors:Policies:AllowReactApp");
    var origins = policySection.GetSection("Origins").Get<string[]>() ?? System.Array.Empty<string>();

    options.AddPolicy("AllowReactApp", policy =>
    {
        if (origins.Length > 0)
        {
            policy.WithOrigins(origins);
        }
        else
        {
            throw new InvalidOperationException(
                   "Production CORS origins are not configured.");
        }

        if (policySection.GetValue<bool>("AllowAnyHeader", true))
        {
            policy.AllowAnyHeader();
        }

        if (policySection.GetValue<bool>("AllowAnyMethod", true))
        {
            policy.AllowAnyMethod();
        }

        if (policySection.GetValue<bool>("AllowCredentials", false))
        {
            policy.AllowCredentials();
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

// app.MapGet("/", () => Results.Ok(new
// {
//     name = "Customer Support SLA API",
//     endpoints = AiEndpoints.Routes
//         .Concat(AutomationEndpoints.Routes)
//         .Concat(CasesEndpoints.Routes)
//         .Concat(LookupsEndpoints.Routes)
//         .Concat(OverviewEndpoints.Routes)
//         .Concat(QueueEndpoints.Routes)
//         .ToArray(),
// }));
app.UseStatusCodePages(async context =>

{

    var request = context.HttpContext.Request;

    var response = context.HttpContext.Response;


    if (response.StatusCode == 404)

    {

        if (request.Path.StartsWithSegments("/api"))

        {

            response.ContentType = "application/json";


            await response.WriteAsJsonAsync(new            {

                Status = 404,

                Message = "The requested API endpoint was not found."            });

        }

        else        {

            response.Redirect("/404.html");

        }

    }

});
app.UseCors("AllowReactApp");
app.MapGet("/health", () =>
{
    return Results.Ok(new
    {
        Status = "Healthy",
        Timestamp = DateTime.UtcNow,
        Environment = app.Environment.EnvironmentName,
        Version = "1.0.0"
    });
});


app.MapAutomationEndpoints();
app.MapCasesEndpoints();
app.MapLookupsEndpoints();
app.MapOverviewEndpoints();
app.MapQueueEndpoints();
app.UseStatusCodePages(async context =>

{

    var request = context.HttpContext.Request;

    var response = context.HttpContext.Response;


    if (response.StatusCode == 404)

    {

        if (request.Path.StartsWithSegments("/api"))

        {

            response.ContentType = "application/json";


            await response.WriteAsJsonAsync(new{

                Status = 404,

                Message = "The requested API endpoint was not found."            });

        }

        else        {

            response.Redirect("/404.html");

        }

    }

});
app.UseCors("AllowReactApp");



app.MapGet("/", async context =>
{
    context.Response.ContentType = "text/html";

    await context.Response.WriteAsync("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Portfolio API</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <style>

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: Segoe UI, Arial, sans-serif;
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #0f172a, #1e293b);
                color: white;
            }

            .card {
                text-align: center;
                background: rgba(255,255,255,.06);
                padding: 50px;
                border-radius: 20px;
                backdrop-filter: blur(10px);
                box-shadow: 0 10px 40px rgba(0,0,0,.3);
                width: 90%;
                max-width: 700px;
            }

            h1 {
                font-size: 3rem;
                margin-bottom: 15px;
            }

            .status {
                color: #22c55e;
                font-weight: bold;
                margin: 20px 0;
            }

            .description {
                opacity: .85;
                line-height: 1.7;
            }

            .footer {
                margin-top: 30px;
                opacity: .7;
                font-size: .9rem;
            }

            .btn {
                display: inline-block;
                margin-top: 25px;
                padding: 12px 20px;
                border-radius: 8px;
                text-decoration: none;
                background: #2563eb;
                color: white;
            }

        </style>
    </head>

    <body>

        <div class="card">

            <h1>Portfolio API</h1>

            <p class="status">✅ Service Online</p>

            <p class="description">
                This backend API powers the application and is not intended
                for direct consumer interaction.
            </p>

            <a href="/health" class="btn">Health Check</a>

            <div class="footer">
                Copyright © 2001 - 2026 Syncfusion® , Inc. All Rights Reserved. | Trademarks
            </div>

        </div>

    </body>
    </html>
    """);
});
app.Run();
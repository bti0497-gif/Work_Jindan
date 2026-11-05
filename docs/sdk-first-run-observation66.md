# SDK first-build observation

The first ModuleHost/Update build using the newly acquired official local SDK
emitted the SDK's automatic ASP.NET HTTPS development-certificate installation
message. No code deliberately invoked certificate creation, trust, store editing
or security disablement. A message alone is not an independent certificate-store
audit; do not claim that no certificate was created. No automatic rollback/removal
of potentially unrelated certificates was attempted.

All subsequent dotnet tools use process-only
DOTNET_GENERATE_ASPNET_CERTIFICATE=false, DOTNET_CLI_TELEMETRY_OPTOUT=1,
DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 and a new-project CLI home. These values are not
written to the global environment/registry. No certificate trust command is run.
This observation is disclosed as a deviation from the intended no-setting-change
boundary, separately from application security/permissions. Native Hancom settings,
fonts and original user data remain untouched by this implementation.

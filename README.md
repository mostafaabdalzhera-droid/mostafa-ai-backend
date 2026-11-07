# MOSTAFA AI — Vercel backend

## Important security action
Revoke the OpenAI key previously shared in chat. Create a fresh project-scoped key. Never put it in Framer, client-side code, Git, screenshots, or messages.

## Files
Create a new folder with the file paths below. Copy each code block into its matching file. This is a source package, not an already deployed service.

## Deploy
1. Create a new Git repository containing these files and import it as a Vercel project.
2. Use Framework Preset: Other. Leave Build Command and Output Directory unset. Use Node.js 22 or newer supported by Vercel.
3. Create an Upstash Redis database. Obtain its REST URL and REST token. The backend intentionally refuses chat requests if its shared rate limiter is not configured.
4. In Vercel → your backend project → Settings → Environment Variables, add:
   - OPENAI_API_KEY: paste your NEW OpenAI key in the Value field. Mark it sensitive.
   - OPENAI_MODEL: gpt-4.1-mini, or a Responses API-compatible text model your account can access.
   - ALLOWED_ORIGINS: comma-separated exact website origins, with https:// and no trailing slash or path. Include your published Framer domain, custom domain, and any specific preview origins you want to test. Avoid wildcards.
   - UPSTASH_REDIS_REST_URL: your Redis REST URL.
   - UPSTASH_REDIS_REST_TOKEN: your Redis REST token. Mark it sensitive.
5. Select Production and, if needed, Preview environments. Redeploy after changing variables.
6. Your endpoint will be https://YOUR-PROJECT.vercel.app/api/chat.
7. Enable OpenAI billing and confirm the selected model is available.
8. Configure Vercel Firewall/WAF rules before exposing the endpoint publicly. CORS is NOT authentication: non-browser callers can forge Origin headers. The shared limiter provides 15 requests per minute per IP, not a total spending cap. Configure usage alerts, monitor cost, and add authenticated quotas or stricter firewall rules for a paid production service. OpenAI project budgets can be alerts rather than hard caps; verify your account settings.
9. The example uses non-streaming JSON responses and retains at most 20 messages per request. Do not send secrets or sensitive personal data in prompts.

## Test
Replace the example origin with an exact allowed origin:

```sh
curl https://YOUR-PROJECT.vercel.app/api/chat \
  -X POST \
  -H 'Origin: https://your-site.framer.website' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"مرحباً! كيف أبدأ تعلّم البرمجة؟"}]}'
```

Success: {"reply":"...a real model response..."}
Errors return {"error":"Arabic message"} with an appropriate HTTP status.
Test forbidden origins, invalid payloads, rate limiting, and real Arabic replies before launch.
If you receive 503, check environment configuration and Redis connectivity. If you receive 502, inspect server logs for the upstream status and request ID; do not expose logs or secrets to visitors.

## Framer connection contract
POST JSON to the endpoint with:
{"messages":[{"role":"user","content":"Your question"},{"role":"assistant","content":"Previous reply"},{"role":"user","content":"Follow-up"}]}

Read the reply field on success. Display the error field on non-success responses.
Keep the API key exclusively on Vercel.
The browser chat widget should keep conversation history in React state, disable duplicate sends during a request, show a loading indicator, handle failed requests with retry, render model text as plain text (not unsafe HTML), and provide a new-chat control. Send only the last 20 messages within the documented character limits.
Client history is not authentication or secure storage.

The Framer chatbot has NOT been modified by this package. After deploying, share only the endpoint URL so it can be connected to the existing website. Demo account/contact screens are unrelated and remain demos.

## Local development
Install Node.js 22+, then run npm install. Copy .env.example to .env.local and populate secrets locally. Run npx vercel dev. Add the exact local website origin to ALLOWED_ORIGINS for browser testing. Never commit .env.local.

## Limits and deployment notes
- Requests time out after 45 seconds upstream; the Vercel function is configured for up to 60 seconds, subject to your Vercel plan.
- Rate limiting uses a shared Redis fixed-minute window, suitable as a baseline rather than full abuse prevention.
- No user accounts, durable conversation history, file attachments, or streaming are implemented.
- The files have been generated but not executed, deployed, or tested against a live OpenAI account in this environment.

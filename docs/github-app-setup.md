# GitHub App Setup

Use this guide after deploying locally with ngrok or publicly on Vercel.

1. Open GitHub, then go to **Settings > Developer settings > GitHub Apps > New GitHub App**.
2. Set **GitHub App name** to `DevGuard AI` or `DevGuard AI Local`.
3. Set **Homepage URL** to your app URL, for example `https://devguard-ai.vercel.app`.
4. Set **Webhook URL** to `https://YOUR_DOMAIN/api/webhooks/github`.
5. Generate a strong **Webhook secret** and copy it into `.env` as `GITHUB_WEBHOOK_SECRET`.
6. Under **Repository permissions**, set:
   - **Contents**: Read-only
   - **Metadata**: Read-only
   - **Pull requests**: Read and write
7. Under **Subscribe to events**, select only **Pull request**.
8. Click **Create GitHub App**.
9. On the app settings page, copy **App ID** into `.env` as `GITHUB_APP_ID`.
10. Click **Generate a private key**, download the `.pem`, and copy its contents into `.env` as `GITHUB_APP_PRIVATE_KEY`. Escape newlines as `\n` if your host requires single-line env values.
11. Click **Install App**, choose your test account or organization, and grant access to a test repository.
12. In Vercel, add the same values under **Project Settings > Environment Variables**, then redeploy.

# GitHub App Setup Guide for DevGuard AI

Follow these precise steps in the GitHub UI to register, configure, and install your GitHub App for production (`https://dev-guard-ai.vercel.app`).

---

## 1. Register New GitHub App

1. Go directly to: **[https://github.com/settings/apps/new](https://github.com/settings/apps/new)**
   *(Or navigate to GitHub Profile > Settings > `<> Developer settings` > GitHub Apps > "New GitHub App")*
2. Fill out the application details:
   - **GitHub App name**: `DevGuard-AI-Production` *(or any unique slug like `devguard-ai-yourusername`)*
   - **Homepage URL**: `https://dev-guard-ai.vercel.app`
   - **Callback URL**: `https://dev-guard-ai.vercel.app` *(optional)*
   - **Webhook**:
     - Check: **Active** (Enabled)
     - **Webhook URL**: `https://dev-guard-ai.vercel.app/api/webhooks/github`
     - **Webhook secret**: Create a secure random string (e.g. `devguard_sec_9948271a`). Store this for `GITHUB_WEBHOOK_SECRET`.

---

## 2. Configure Permissions

Under **Repository permissions**, configure the following:
- **Contents**: `Access: Read-only` *(Allows the agent to read PR diffs and file patches)*
- **Pull requests**: `Access: Read and write` *(Allows the agent to post structured review comments & inline annotations)*
- **Metadata**: `Access: Read-only` *(Default system permission to read repo metadata)*

Under **Subscribe to events**:
- Check **Pull request** *(Triggers webhook on `opened`, `synchronize`, `reopened`)*

Under **Where can this GitHub App be installed?**:
- Choose **Any account** *(Recommended for public use)* or **Only on this account**.

Click **Create GitHub App**.

---

## 3. Extract & Download Credentials

Once created, you will be on the General Settings page:

1. **App ID**:
   - Near the top in the **About** section, note the numeric **App ID** (e.g., `1122334`).
   - Maps to: `GITHUB_APP_ID`

2. **App Slug / Public Link**:
   - Note the exact URL name of your app from the top title or the URL bar (e.g., `devguard-ai-production` from `https://github.com/apps/devguard-ai-production`).
   - Maps to: `NEXT_PUBLIC_GITHUB_APP_SLUG` and `GITHUB_APP_SLUG`
   - Install URL: `https://github.com/apps/{your-app-slug}/installations/new`
   - Maps to: `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` and `GITHUB_APP_INSTALL_URL`

3. **Generate Private Key**:
   - Scroll down to the **Private keys** section.
   - Click **Generate a private key**.
   - A `.pem` certificate file will download to your machine.
   - Open this `.pem` file in a text editor (Notepad, VS Code).
   - Maps to: `GITHUB_APP_PRIVATE_KEY`
   - *Note for Vercel*: Wrap the entire PEM string in double quotes or replace newlines with `\n` if needed.

---

## 4. Environment Variables Mapping Reference

| GitHub App Setting | Environment Variable Name | Example / Notes |
| :--- | :--- | :--- |
| Numeric App ID | `GITHUB_APP_ID` | `1122334` |
| Generated Private Key | `GITHUB_APP_PRIVATE_KEY` | `"-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"` |
| Webhook Secret | `GITHUB_WEBHOOK_SECRET` | `devguard_sec_9948271a` |
| App URL Slug | `NEXT_PUBLIC_GITHUB_APP_SLUG` | `devguard-ai-production` |
| App Direct Install Link | `NEXT_PUBLIC_GITHUB_APP_INSTALL_URL` | `https://github.com/apps/devguard-ai-production/installations/new` |

---

## 5. Install on Test Repository

1. In the left sidebar of your GitHub App settings, click **Install App**.
2. Click **Install** next to your account or organization.
3. Select **"All repositories"** or **"Only select repositories"** (select `dev-guard-ai` or a test repo).
4. Click **Install & Authorize**.

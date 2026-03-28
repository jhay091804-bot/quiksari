# QuickSari Deployment Guide

## Recommended: Railway (Free, takes ~5 minutes)

### Step 1 — Push to GitHub

1. Go to https://github.com and create a **new repository** named `quicksari`
2. Keep it **Public** (or Private — both work)
3. Open **PowerShell** in `C:\Users\ocamp\Desktop\QuickSari` and run:

```
git init
git add .
git commit -m "Initial QuickSari deployment"
git remote add origin https://github.com/YOUR_USERNAME/quicksari.git
git push -u origin main
```

### Step 2 — Deploy on Railway

1. Go to **https://railway.app** and sign in with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `quicksari` repository
4. Railway auto-detects Node.js and deploys it

### Step 3 — Set Environment Variables on Railway

In your Railway project → **Variables** tab → add these:

| Variable | Value |
|---|---|
| `EMAIL_USER` | ocampo.johnsen15@gmail.com |
| `EMAIL_PASS` | fdhzaggwfixjjemz |
| `GROQ_API_KEY` | gsk_HzTQN... (your full key) |

### Step 4 — Get Your Public URL

Railway gives you a free URL like:
`https://quicksari-production.up.railway.app`

That's it! Your app is live. 🎉

---

## Notes

- **db.json** (user accounts) resets if Railway restarts the container.
  For permanent user storage, you'd need to connect a database (e.g., Railway's free PostgreSQL).
- **localStorage data** (products, orders, wallet, loans) is stored in each user's browser — it is NOT shared between users. This is by design for a local store app.
- The free Railway plan gives you **$5/month credit** which is enough to run this 24/7.

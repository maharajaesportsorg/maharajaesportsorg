# Maharaja Esports & Creatives — website and backend

This project follows your selected preferences:
- **Team access:** owner, admin and editor roles.
- **Creator imagery:** creator avatars and public channel statistics fetched from YouTube Data API v3.
- **Applications:** stored in Supabase and reviewed in the private dashboard. No application email notifications.
- **Domain:** deploy on the hosting provider URL first; connect a custom domain later.

This is a production-oriented starter project, but it is **not live until you configure Supabase, Google API credentials and hosting**.

## 1. Requirements
Node.js 20+, a Supabase project, Google Cloud project with YouTube Data API v3 enabled, and a hosting provider such as Render.

## 2. Set up Supabase
1. Create a project at https://supabase.com.
2. Open SQL Editor and run the full `supabase/schema.sql` file.
3. In Project Settings → API, copy Project URL, anon/public key and service-role key.
4. In Authentication → URL Configuration, allow your local URL `http://localhost:3000`. Add your deployed URL after hosting.
5. Keep email/password authentication enabled. Team members accept their email invitation and sign in with their password.

## 3. Create the first owner
1. In Supabase → Authentication → Users, create the owner's account with a secure password.
2. Copy its UUID.
3. Run this in SQL Editor, replacing the values:
   ```sql
   insert into public.team_members(user_id,email,role,active)
   values ('AUTH-USER-UUID','your-real-email@example.com','owner',true);
   ```
The owner can invite Admins and Editors in the dashboard. Admins can manage creator profiles and team access. Editors can review applications. Owner role cannot be assigned from the dashboard.

## 4. Configure YouTube API
1. Open https://console.cloud.google.com/ and create/select a project.
2. Enable YouTube Data API v3 and create an API key.
3. Restrict the key to YouTube Data API v3. It must remain on the server in `.env`, never in frontend code.
4. To add a creator, supply the channel ID (`UC` followed by 22 characters), not only the @handle. The server fetches the channel avatar and public statistics.

## 5. Local setup
```bash
cp .env.example .env
# Fill all values in .env
npm install
npm start
```
Open `http://localhost:3000` and `http://localhost:3000/admin`.

**One required browser-safe configuration:** open `public/admin/admin.js` and replace the two placeholder constants at the top:
```js
const SUPABASE_URL='https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY='YOUR_SUPABASE_ANON_KEY';
```
The anon key is intended for browser use. Never put the service-role key in this file.

## 6. Deploy to Render
1. Push the project to a private GitHub repository.
2. Create a Render Web Service connected to that repository.
3. Build command: `npm install`; Start command: `npm start`.
4. Add environment variables from `.env.example` in Render. Set `NODE_ENV=production`, `TRUST_PROXY=1`, and `APP_ORIGIN` to your Render HTTPS URL. Add the Supabase URL, anon key, service-role key and YouTube API key.
5. Commit the two public Supabase settings in `public/admin/admin.js` before deployment.
6. Deploy and test `/api/health`, public application submission, dashboard login, review updates, creator add/refresh and team invitations.
7. When you buy a domain later, add it in Render, update `APP_ORIGIN`, and add the domain to Supabase Auth's allowed redirect URLs.

## 7. Security and operations
- Never commit `.env`. Never expose `SUPABASE_SERVICE_ROLE_KEY` or privileged credentials in browser code.
- Supabase RLS is enabled. Public clients can only read published creator profiles. Applications and team membership have no public policies; privileged access is performed server-side after validating the user's Supabase token and team role.
- Application submission has server-side validation, rate limiting and a hidden honeypot field. Add CAPTCHA/Turnstile if spam becomes significant.
- Enable MFA for team accounts where available, use strong passwords, and keep owner access restricted.
- YouTube API quota applies. Refresh channel profiles only when needed.
- Back up the database. For larger volumes, add pagination, audit logs, export tools and monitoring.
- Versus content is intentionally a placeholder until you define the competitive format and rules.

## 8. Existing creator and social links
The public site includes Shiva Is Live as a fallback creator card. Add the YouTube channel ID in the dashboard to switch to API-driven creator data. Official Maharaja YouTube, Instagram and contact email are already included.

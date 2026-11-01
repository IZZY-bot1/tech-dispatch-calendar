# Greenlight Dispatch Portal

A dispatch portal for Greenlight Lawn Care with separate Admin and Technician logins, built on Supabase.

## Admin
- Month, week and day calendar of every tech's jobs. Day view shows one column per technician.
- Filter by technician, customer/address or payment status.
- Create, edit, reassign and delete jobs.
- Manage technicians: add a tech with their email, edit, change color or role, and deactivate (upcoming jobs get reassigned).
- Download jobs as CSV or a PDF report: daily, weekly, monthly or a custom range; per technician or per customer; with totals.
- See every job's acceptance, status, invoice, payments and message history.

## Technician
- **My jobs** list plus a **Schedule** calendar showing only their own jobs.
- **Accept** or **Decline** jobs, then **Start job** and **Mark completed**.
- See the customer's address with an **Open in Maps** link, and call the customer.
- **Message the customer** with quick templates (On my way, Arrived, Job done, Reschedule). Messages open the phone's Text or Email app and are logged.
- **Invoice:** add services (preset or custom, with qty and price), record payment, then **text, email, copy or print** the invoice.

## Logins
1. Admin: open the portal, click **Create your account** and use `engalapag@gmail.com`. That email is preset as Admin.
2. Add technicians in **Manage technicians** with each tech's email.
3. Each tech opens the portal, clicks **Create your account** with that same email, confirms it from their inbox, and signs in.

## Setup
- `config.js` holds the Supabase URL and publishable key, plus the business name and service list.
- Data lives in the `gl_*` tables of the Supabase project. Row-level security means a tech can only read and update their own jobs.
- In Supabase **Authentication → URL Configuration**, set the Site URL to `https://izzy-bot1.github.io/tech-dispatch-calendar/` so confirmation emails link back here.

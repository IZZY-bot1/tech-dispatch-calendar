# Tech Dispatch Calendar – Greenlight Lawn Care

A browser-based dispatch calendar for scheduling lawn care technicians.

## Features
- **Month / Week / Day views.** Day view shows one column per technician.
- **Technician filters:** a dropdown plus toggle chips, each tech color-coded.
- **Customer search** by name or address, and a **payment filter** (Paid / Unpaid / Partial).
- **Jobs** store the customer, address, service type, notes, tech, status, date, time and duration.
- **Payment tracking:** price, payment status, amount paid, balance due (calculated automatically), method, payment date and receipt #.
- **Admin, Manage technicians:** add, edit, pick a color, and deactivate a tech (their upcoming jobs get reassigned).
- **Admin, Download jobs:** daily, weekly, monthly or custom range; per technician or per customer/address; filter by payment; CSV (opens in Excel) or PDF (through the print dialog), with subtotals and grand totals.
- **Tech role preview:** a technician sees only their own jobs and can change only the job status.
- Ships with sample data marked "(example)", plus a **Clear sample data** button.

## Run it
Open `index.html` in a browser, or turn on **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root).

## Data
Data is saved in each browser's localStorage, so it's per device. To share one schedule across a team, connect a backend (for example Supabase) or your CRM.

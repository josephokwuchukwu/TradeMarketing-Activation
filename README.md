# Trade Activate

Trade Activate is a web app for trade marketing activations. Vendors (activation agencies) send brand ambassadors (BAs) to outlets to run activations, sampling and trade activities for our brands. BAs log what is happening from their phones, and the trade marketing team and each vendor's manager watch it live.

**Brands:** Trophy Lager, Trophy Stout, Budweiser, Budweiser Royale, Hero Lager, Beta Malt, Grand Malt, Flying Fish, Eagle, Castle Lite.

## Who signs in, and what they see

| Role | Signs in with | Panes |
| --- | --- | --- |
| **Admin** (trade marketing) | Email and password | Live dashboard (all vendors), Vendor folders (every vendor), Outlets (upload and assign), Vendors & users (register, edit and delete vendors, share outlets with them, add managers and BAs) |
| **Vendor Manager** | Email and password | Live dashboard (their vendor only), their vendor folder, the outlets shared with them (and which ambassador covers each), their ambassadors |
| **Brand Ambassador** | BA ID or phone number, plus a PIN | My activation (log form, live card), History |

### Owner account

Jay's own admin sign-in is `jay@tradeactivate.app`. The password was shared with Jay directly and is not in this repository (only its hash is). Change it any time under **My account** (the person icon in the top bar).

### Example accounts (created on first run)

| Role | Sign-in | Password / PIN |
| --- | --- | --- |
| Admin | `admin@tradeactivate.app` | `Admin@123` |
| Vendor Manager, Pinnacle Activations | `tobi@pinnacle.ng` | `Manager@123` |
| Vendor Manager, BlueWave Experiential | `nkechi@bluewave.ng` | `Manager@123` |
| Vendor Manager, Kora Field Marketing | `musa@kora.ng` | `Manager@123` |
| Brand Ambassadors | `BA-1001` to `BA-1012` | `1234` |

The example vendors, people, outlets and photos are made up. An admin can wipe them under **Vendors & users → Reset example data**.

## Features

- **Look.** Gold theme built on #C68D16 with a gold gradient, in light and dark mode.
- **Sign-in page.** A turning 3D ring of real brand and field photos (drag to spin) behind the sign-in card.
- **Live dashboard.** A 3D map of Nigeria built from real boundaries (37 states, the Niger and Benue, Lake Chad, major cities; Natural Earth, public domain). States are tinted by vegetation belt (mangrove and rainforest in the south through Guinea and Sudan savanna to the Sahel), with forests and the main national parks (Cross River, Okomu, Old Oyo, Kainji Lake, Yankari, Gashaka-Gumti and others) shown as trees, and they rise with the week's activity. Zoom into a city or open an entry and **Street view here** opens Google Street View for that spot. Hover a state for its numbers, tap it to fly in, or switch between the Nigeria and Lagos views. There is a beam for every activation, sampling session or trade activity that is running now, coloured by activity type. KPIs show what is running, ambassadors on the ground, cases sold today, outlets activated and live photos. You can filter by activity type, brand and (for admins) vendor. Tapping a beam or row opens the entry: photos, recorded location (with a Google Maps link and distance from the outlet), opening cases, cases sold and closing cases.
- **Vendor folders.** One folder per vendor, holding a folder per day, holding every entry ambassadors logged. You can filter by brand. Vendor managers only see their own folder.
  - **Custom folders.** Admins, and each vendor's manager, can add named folders inside a vendor (a campaign, promo or region), rename or delete them, and file any entry into one from the entry's details. Ambassadors can pick the folder when they log.
- **Brand ambassador log form.**
  - Pick the outlet. Outlets their manager assigned to them are listed first, then the rest of the vendor's outlets, or they can type a new one.
  - Choose the activity type and brand.
  - Enter opening cases, cases sold and consumers reached.
  - Record GPS location. The form shows the nearest assigned outlet.
  - Take live photos with the phone camera. Every photo is resized and stamped with the brand, outlet, time and coordinates. Photos older than 15 minutes are flagged.
  - Start it as **Still running**, then add more photos, update cases sold and **End activation** later. Or submit it as **Already finished**.
- **Colourful live dashboard (admin and vendor manager).** KPI tiles with 7-day sparklines that count up when numbers change, the activity mix right now, cases sold over the last 7 days, cases by segment, a vendors-today scoreboard (admin) or outlet coverage ring (vendor manager), plus filters by activity, brand, segment and vendor.
- **Segments.** Every outlet has a trade segment: Mainstream, Low End, High End, Key Account, Open Market, Spiritual Home, Out of Home, plus four recommended additions: Modern Trade (supermarkets, malls), HoReCa (hotels, restaurants, cafés), Events & Festivals, and Wholesale (distributors). Set it in the upload's `Segment` column or on the Outlets page; a first guess is made from the channel and area. Activations carry the outlet's segment into reports and Power BI.
- **Photo folders and zip download.** Every live photo is named after its outlet and time (`Mama Tee Lounge 2026-10-07 14.32.05.jpg`). Vendor folders have a By outlet section with each outlet's photos. **Download photos (.zip)** saves the current vendor, folder, day or outlet, and the admin's **Download all photos** saves everything; unzipped, it is one folder per vendor and outlet, with a `photo-index.csv`.
- **Outlets.** Upload an Excel (`.xlsx`) or CSV list of activating outlets, preview it, assign outlets to vendors (one by one, in bulk, or from a `Vendor` column), and import. Outlets without coordinates are placed by their area name (Ikeja, Lekki, Surulere and others). See `sample-data/outlets-sample.csv` for the columns.
- **Vendors & users.** Register a vendor, pick its brands, and create its manager's sign-in. Each vendor card has **Edit** (name, manager, phone, sign-in email, brands, password reset), **Outlets** (tick which outlets the vendor activates), **Upload outlet list** (import a file straight to that vendor) and **Delete**. Deleting a vendor switches off its sign-ins, ends its running activations and returns its outlets to Not assigned; its past entries stay in reports under its name. Add brand ambassadors with a BA ID and PIN. Vendor managers can add their own ambassadors.
- **Ambassadors per outlet (vendor manager).** On Our outlets, a manager assigns one or more of their ambassadors to each shared outlet, one row at a time or by ticking several outlets. A filter shows outlets that have no ambassador yet. The admin's Outlets page and the outlets download show who covers each outlet.
- **Beta features.**
  - **Top ambassadors today.** A leaderboard on the dashboard ranks BAs by cases sold, with consumers reached.
  - **Location check.** Running activations are flagged when the phone shared no location, or was more than 500 m from the outlet's listed position. Flags show on the dashboard and in the report.
  - **Download report.** One click exports an Excel file (Activations sheet and a vendor-by-brand Summary sheet) for today, the last 7 or 30 days, or everything, using the dashboard filters.
  - **My account.** Everyone can change their own password, and BAs their PIN.
  - **Install on phone.** The hosted page can be added to a phone's home screen and keeps opening on a weak network (manifest and service worker; hosted page only).
- **Data & Power BI (admin).** Download activations, a daily summary, outlets, people, vendors and folders as Excel or CSV, for any period and vendor, one at a time or all together. The Power BI dataset is a workbook with an Activations fact table joined by ID to Vendors, Outlets, Ambassadors, Brands, Folders and a Calendar. The pane gives the steps to connect it from OneDrive or SharePoint with scheduled refresh, and a Power Query script. A live Power BI connection with no downloads needs the shared backend described below; Power BI then reads it through its PostgreSQL connector.
- **Real brand images.** Product shots of each brand (cut from Jay's pictures) appear on the sign-in screen, in the brand pickers, on the dashboard bars and in entry details. Example entries use real field photos of the brands. The files are in `assets/`.
- **Light and dark mode.** Use the sun or moon button on the sign-in screen and in the top bar. The choice is remembered on each device. Before you pick, the app follows the device setting.

## Running it

It is a single static page with no build tooling. It needs no server.

```sh
./build.sh                 # writes index.html from src/app.html
python3 -m http.server     # then open http://localhost:8000
```

To host it, turn on **GitHub Pages** for this repository (Settings → Pages → deploy from the `main` branch, root folder). Ambassadors can then open it on their phones. GPS and the camera need HTTPS, which Pages provides.

`src/app.html` is the source. `index.html` is generated from it by `build.sh` (it adds the `<!doctype>` and `<head>`). Edit the source, run the build, and commit both.

Three.js (3D) and SheetJS (Excel import) load from cdnjs.

## Important: where data is stored today

All data (accounts, outlets, entries, photos) is stored **in the browser of the device using the app** (IndexedDB). That makes it a working prototype, not yet a shared system:

- An ambassador's entries on their phone **won't** appear on the admin's laptop.
- Two tabs in the same browser do stay in sync live. Try a BA in one tab and the admin in another.
- Passwords are hashed in the browser. This isn't real security.

### Next step: a shared backend

To make it multi-user, replace the `DB` and `save()` layer in `src/app.html` with a hosted backend. The data model is already split the way a database needs it:

| Collection | Holds |
| --- | --- |
| `vendors` | Name, contact, brands, colour |
| `users` | Role (`admin`, `manager`, `ba`), sign-in, `vendorId` |
| `outlets` | Name, address, area, channel, lat/lng, `vendorId`, brands, `baIds` (assigned ambassadors) |
| `entries` | BA, vendor, outlet, brand, type, start/end, opening/sold cases, consumers reached, GPS, photo ids, notes |
| `photos` | Stamped JPEG, time, GPS |

A good fit is **Supabase** (Postgres, auth with email/password and phone OTP, file storage for photos, and row-level security so vendor managers only read their own vendor's rows). **Firebase** works the same way.

## Project layout

```
src/app.html                    the app (HTML, CSS and JS in one file)
index.html                      built page for hosting (generated by build.sh)
build.sh                        builds index.html (adds the head, manifest link and service worker)
manifest.webmanifest, sw.js     make the hosted page installable and usable on a weak network
icons/                          app icon (SVG source and PNGs)
assets/brands/                  product shot per brand, plus the full lineup
assets/field/                   brand photos used for the example entries
assets/login/                   photos on the 3D sign-in ring
assets/nigeria.json             Nigeria map data: states, rivers, lakes, cities (Natural Earth)
sample-data/outlets-sample.csv  example outlet upload
```

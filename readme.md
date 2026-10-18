# The Old Oak Library

A library management system with a skeuomorphic (wood, leather and paper) interface.
Built with **FastAPI**, **SQLite** and plain **HTML, CSS and JavaScript** (no frameworks).

## Features

- **Accounts:** sign up and sign in with username, phone and password. Passwords are stored as salted hashes (PBKDF2), never as plain text.
- **Roles:** `admin` and `user`. Only admins can add or delete books and members. Everyone logged in can search books and issue or return them.
- **Books:** add, delete and live search by title or author.
- **Members:** every new account is added to the members list automatically (no duplicates by phone number).
- **Issue / Return:** type the member's user name, search a book with suggestions from the database, and issue it for 14 days. Returning late adds a fine (1 per day).
- **Dashboard:** total books, issued now, members and overdue count.
- **Safe rendering:** API data is never inserted with `innerHTML`.

## Tech stack

| Part | Tool |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Database | SQLite (`library.db` for the library, `login.db` for accounts) |
| Frontend | HTML, CSS, vanilla JavaScript, Google Fonts |

## Project structure

```
Library managment/
├── main.py            # FastAPI app: routes, database, login, roles
├── make_admin.py      # small script to promote a user to admin
├── requirements.txt
├── Static/
│   ├── index.html     # main page (dashboard, books, members, issue/return)
│   ├── style.css
│   ├── app.js
│   ├── login.html     # sign in / create account
│   ├── login.css
│   └── login.js
├── library.db         # created automatically (books, members, issues)
└── login.db           # created automatically (accounts)
```

## Run it locally

1. **Create and activate a virtual environment** (Windows PowerShell):

   ```
   cd "C:\path\to\Library managment"
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

   On Mac/Linux use `source venv/bin/activate` instead.

2. **Install the packages:**

   ```
   pip install -r requirements.txt
   ```

3. **Start the server:**

   ```
   uvicorn main:app --reload
   ```

4. **Open** `http://127.0.0.1:8000/login`, choose **Create an account**, then sign in.

The two database files are created automatically the first time the server starts.

## Make yourself an admin

New accounts are always `user`. To promote one, run this once (the server can stay running):

```
python make_admin.py
```

Type the username exactly as you registered it. Then log out and log in again.

## API overview

| Method | Path | Who | What it does |
|---|---|---|---|
| POST | `/signin` | anyone | create an account (also adds the member) |
| POST | `/login` | anyone | returns a token and the role |
| GET | `/books?search=` | logged in | list or search books |
| POST | `/books` | admin | add a book |
| DELETE | `/books/{id}` | admin | delete a book |
| GET | `/members` | logged in | list members |
| POST | `/members` | admin | add a member |
| DELETE | `/members/{id}` | admin | delete a member |
| GET | `/issued` | logged in | list issued records |
| POST | `/issue` | logged in | issue a book |
| POST | `/return/{issue_id}` | logged in | return a book and calculate the fine |

Protected routes expect the header `Authorization: Bearer <token>`. The frontend sends it automatically.
Errors come back as `{"detail": "..."}` with a status such as `401` (not logged in), `403` (not an admin), `404` or `400`.

## Known limitations

- Sessions live in server memory. **Restarting the server logs everyone out.**
- There is no OTP or email check, so anyone can register with any phone number.
- The Swagger page (`/docs`) cannot send the `Authorization` header, so test protected routes from the app itself.
- A book that is currently issued can still be deleted, which hides its record from the ledger.
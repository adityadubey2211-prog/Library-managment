import secrets
import os, hmac, hashlib
from datetime import date, timedelta
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sqlite3


app = FastAPI()

session = {}

def get_current_user(authorization: str = Header(default=None)):
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="please login first")
    token = authorization[7:] # Remove "Bearer " prefix
    user = session.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="session expired. please  login again")
    return user


def require_admin(user = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code = 403, detail = "only Admin can do this")
    return user






@app.get("/login")
def read_index():
    return FileResponse("Static/login.html")
app.mount("/static", StaticFiles(directory="Static"))
#data base connection
def get_db():
    conn = sqlite3.connect("library.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute(""" 
                CREATE TABLE IF NOT EXISTS books(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                copies_available INTEGER NOT NULL    
                )
    """)
    conn.execute("""
                CREATE TABLE IF NOT EXISTS members(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    joined_date TEXT NOT NULL        
                )
    """)
    conn.execute("""
                CREATE TABLE IF NOT EXISTS issues(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_id INTEGER NOT NULL,
                    member_id INTEGER NOT NULL,
                    issue_date TEXT NOT NULL,
                    due_date TEXT NOT NULL,
                    return_date TEXT,
                    fine INTEGER DEFAULT 0,
                    FOREIGN KEY (book_id) REFERENCES books(id),
                    FOREIGN KEY (member_id) REFERENCES members(id)
                )
    """)
    conn.commit()
    conn.close()
init_db()
class BookIn(BaseModel):
    title: str
    author: str
    copies_available: int
    
@app.get("/books")
def get_books(search: str = "", user = Depends(get_current_user)):
    conn = get_db()
    pattern = f"%{search}%"
    rows = conn.execute("SELECT * FROM books WHERE title LIKE ? OR author LIKE ?", 
                        (pattern, pattern)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# add a book to the database

@app.post("/books")
def add_book(book: BookIn, admin = Depends(require_admin)):
    conn = get_db()
    cur = conn.execute("INSERT INTO books (title, author, copies_available) VALUES (?, ?, ?)",
                 (book.title, book.author, book.copies_available))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id, "message": "Book added successfully"}

# delete a book from the database
@app.delete("/books/{book_id}")
def delete_book(book_id: int, admin = Depends(require_admin)):
    conn = get_db()
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    deleted = conn.total_changes
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Book not found")
    return {"message": "Book deleted successfully"}
# for members
class MemberIn(BaseModel):
    name: str
    phone: str


# get all members
@app.get("/members")
def get_members(search: str = "", user = Depends(get_current_user)):
    conn = get_db()
    pattern = f"%{search}%"
    rows = conn.execute(
        "SELECT * FROM members WHERE name LIKE ? OR phone LIKE ?",
        (pattern, pattern)
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/members")
def add_member(member: MemberIn, admin = Depends(require_admin)):
    conn = get_db()
    cur = conn.execute("INSERT INTO members(name, phone, joined_date) VALUES (?,?,?)", 
                        (member.name, member.phone, date.today().isoformat()))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id, "message": "Member added successfully"}
@app.delete("/members/{member_id}")
def delete_member(member_id: int, admin = Depends(require_admin)):
    conn = get_db()
    conn.execute("DELETE FROM members WHERE id = ?", (member_id,))
    conn.commit()
    deleted = conn.total_changes
    conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"message": "Member deleted successfully"}

# issue or return a book
class IssueIn(BaseModel):
    book_id: int
    member_id: int


@app.get("/issued")
def get_issues(user = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute("""
        SELECT issues.id, books.title AS title, members.name AS member, 
               issues.issue_date, issues.due_date, issues.return_date, issues.fine
        FROM issues
        JOIN books ON issues.book_id = books.id
        JOIN members ON issues.member_id = members.id
    """).fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/issue")
def issue_book(data: IssueIn, user = Depends(get_current_user)):
    conn = get_db()
    # Check if the book is available
    book = conn.execute("SELECT * FROM books WHERE id = ?", (data.book_id,)).fetchone()
    if not book:
        conn.close()
        raise HTTPException(status_code=404, detail="Book not found")
    if book["copies_available"] <= 0:
        conn.close()
        raise HTTPException(status_code=400, detail="No copies available for this book")
    
    # Check if the member exists
    member = conn.execute("SELECT * FROM members WHERE id = ?", (data.member_id,)).fetchone()
    if not member:
        conn.close()
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Issue the book
    issue_date = date.today().isoformat()
    due_date = (date.today() + timedelta(days=14)).isoformat()  # 2 weeks loan period
    conn.execute("INSERT INTO issues (book_id, member_id, issue_date, due_date) VALUES (?, ?, ?, ?)",
                 (data.book_id, data.member_id, issue_date, due_date))
    
    # Update the number of available copies
    conn.execute("UPDATE books SET copies_available = copies_available - 1 WHERE id = ?", (data.book_id,))
    
    conn.commit()
    conn.close()
    
    return {"message": "Book issued successfully", "due_date": due_date}

# return a book
class ReturnIn(BaseModel):
    issue_id: int
    
@app.post("/return/{issue_id}")
def return_book(issue_id: int, user = Depends(get_current_user)):
    conn = get_db()
    issue = conn.execute("SELECT * FROM issues WHERE id = ?", (issue_id,)).fetchone()
    if not issue:
        conn.close()
        raise HTTPException(status_code=404, detail="Issue record not found")
    
    if issue["return_date"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Book has already been returned")
    
    return_date = date.today().isoformat()
    due_date = date.fromisoformat(issue["due_date"])
    fine = 0
    if date.today() > due_date:
        fine = (date.today() - due_date).days * 1  # Assuming $1 fine per day
    
    conn.execute("UPDATE issues SET return_date = ?, fine = ? WHERE id = ?", 
                 (return_date, fine, issue_id))
    
    # Update the number of available copies
    conn.execute("UPDATE books SET copies_available = copies_available + 1 WHERE id = ?", (issue["book_id"],))
    
    conn.commit()
    conn.close()
    
    return {"message": "Book returned successfully", "fine": fine}  

# login page
def get_login_db():
    conn = sqlite3.connect("login.db")
    conn.row_factory = sqlite3.Row
    return conn
def login_db():
    conn = get_login_db()
    conn.execute(""" 
                CREATE TABLE IF NOT EXISTS login(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user'
                )
    """)
    conn.commit()
    conn.close()
login_db()
    
class LoginIn(BaseModel):
    username: str
    phone: str
    password: str


# session = {}


# storing password securely using hashing
def hash_password(password):
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return salt.hex() + ":" + h.hex()

def check_password(password, stored):
    salt_hex, hash_hex = stored.split(":")
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 100000)
    return hmac.compare_digest(h.hex(), hash_hex)

    
# LOGIN
@app.post("/login")
def login_user(data: LoginIn):
    conn = get_login_db()

    user = conn.execute(
        "SELECT * FROM login WHERE username = ? AND phone = ?",
        (data.username, data.phone)
    ).fetchone()

    conn.close()

    if not user or not check_password(data.password, user["password"]):
        raise HTTPException(
            status_code=401,
            detail="Invalid username, phone or password"
        )
    token = secrets.token_hex(16)
    session[token] = {
    "id": user["id"],
    "username": user["username"],
    "role": user["role"]
    }

    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        'token': token,
        "message": "Login successful"
    }


# adding a new user to the login database and members database
@app.post("/signin")
def signin_user(data: LoginIn):
    login_conn = get_login_db()
    members_conn = get_db()

    try:
        # Check whether the phone number already exists
        existing_user = login_conn.execute(
            "SELECT id FROM login WHERE phone = ?",
            (data.phone,)
        ).fetchone()

        if existing_user:
            raise HTTPException(
                status_code=400,
                detail="Account already exists. Please login."
            )

        # Create account in login.db
        login_conn.execute(
            "INSERT INTO login (username, phone, password) VALUES (?, ?, ?)",
            (data.username, data.phone, hash_password(data.password))
        )

        # Automatically add the user to library.db members table
        already_member = members_conn.execute(
            "SELECT id FROM members WHERE phone = ?",
            (data.phone,)
        ).fetchone()

        if already_member is None:
            members_conn.execute(
                "INSERT INTO members (name, phone, joined_date) VALUES (?, ?, ?)",
                (data.username, data.phone, date.today().isoformat())
            )

        login_conn.commit()
        members_conn.commit()

        return {
            "message": "Account created successfully",
            "username": data.username
        }

    except Exception:
        login_conn.rollback()
        members_conn.rollback()
        raise

    finally:
        login_conn.close()
        members_conn.close()


@app.get("/")
def home():
    return FileResponse("Static/index.html")
from datetime import date, timedelta
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sqlite3


app = FastAPI()
@app.get("/")
def read_index():
    return FileResponse("Static/index.html")
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
def get_books(search: str = ""):
    conn = get_db()
    pattern = f"%{search}%"
    rows = conn.execute("SELECT * FROM books WHERE title LIKE ? OR author LIKE ?", 
                        (pattern, pattern)).fetchall()
    conn.close()
    return [dict(row) for row in rows]

# add a book to the database

@app.post("/books")
def add_book(book: BookIn):
    conn = get_db()
    cur = conn.execute("INSERT INTO books (title, author, copies_available) VALUES (?, ?, ?)",
                 (book.title, book.author, book.copies_available))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id, "message": "Book added successfully"}

# delete a book from the database
@app.delete("/books/{book_id}")
def delete_book(book_id: int):
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
def get_members(search: str = ""):
    conn = get_db()
    pattern = f"%{search}%"
    rows = conn.execute("SELECT * FROM members WHERE name LIKE ? OR phone LIKE ?", 
                        (pattern, pattern)).fetchall()
    conn.close()
    return [dict(row) for row in rows]
@app.post("/members")
def add_member(member: MemberIn):
    conn = get_db()
    cur = conn.execute("INSERT INTO members(name, phone, joined_date) VALUES (?,?,?)", 
                        (member.name, member.phone, date.today().isoformat()))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"id": new_id, "message": "Member added successfully"}
@app.delete("/members/{member_id}")
def delete_member(member_id: int):
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
def get_issues():
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
def issue_book(data: IssueIn):
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
def return_book(issue_id: int):
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
                phone TEXT NOT NULL,
                password TEXT NOT NULL
                )
    """)
    conn.commit()
    conn.close()
login_db()
    
class LoginIn(BaseModel):
    username: str
    phone: str
    password: str
    
    
@app.get("/login")
def login_user(data: LoginIn):
    conn = get_login_db()
    user = conn.execute("SELECT * FROM login WHERE username = ? AND phone = ? AND password = ?", 
                        (data.username, data.phone, data.password)).fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found")
    conn.close()
    return {"message": "Login successful"}
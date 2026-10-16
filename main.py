from pydantic import BaseModel
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sqlite3


app = FastAPI()
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
    conn.execute("INSERT INTO books (title, author, copies_available) VALUES (?, ?, ?)",
                 (book.title, book.author, book.copies_available))
    conn.commit()
    conn.close()
    return {"id": book.title, "message": "Book added successfully"}

# delete a book from the database
@app.delete("/books/{book_id}")
def delete_book(book_id: int):
    conn = get_db()
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    conn.close()
    return {"message": "Book deleted successfully"}
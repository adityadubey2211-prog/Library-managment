
import sqlite3

conn = sqlite3.connect("library.db")

count = conn.execute(
    "SELECT COUNT(*) FROM books"
).fetchone()[0]

print("Total books:", count)

conn.close()

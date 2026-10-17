import sqlite3

username = input("Username to make admin: ")

conn = sqlite3.connect("login.db")
conn.execute("UPDATE login SET role = 'admin' WHERE username = ?", (username,))
conn.commit()

print(conn.execute("SELECT id, username, role FROM login").fetchall())
conn.close()
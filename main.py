
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path

from database import get_connection, initialize_database

BASE_DIR = Path(__file__).resolve().parent


class TaskManagerHandler(BaseHTTPRequestHandler):

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 100_000:
            raise ValueError("Request is too large.")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def get_task_id(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "tasks"]:
            try:
                return int(parts[2])
            except ValueError:
                return None
        return None

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/":
            self.serve_file("templates/index.html", "text/html")
            return

        if path == "/style.css":
            self.serve_file("static/style.css", "text/css")
            return

        if path == "/script.js":
            self.serve_file("static/script.js", "text/javascript")
            return

        if path == "/api/tasks" or path.startswith("/api/tasks/"):
            conn = get_connection()
            try:
                cursor = conn.cursor()
                task_id = self.get_task_id()

                if task_id is not None:
                    cursor.execute(
                        "SELECT * FROM tasks WHERE id = ?", (task_id,)
                    )
                    row = cursor.fetchone()
                    if row is None:
                        self.send_json({"error": "Task not found"}, 404)
                    else:
                        self.send_json(self.row_to_dict(cursor, row))
                else:
                    cursor.execute("SELECT * FROM tasks ORDER BY id DESC")
                    rows = cursor.fetchall()
                    self.send_json([
                        self.row_to_dict(cursor, row) for row in rows
                    ])
            finally:
                conn.close()
            return

        self.send_json({"error": "Not found"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/tasks":
            self.send_json({"error": "Not found"}, 404)
            return

        try:
            data = self.read_json()
            title = str(data.get("title", "")).strip()

            if not title:
                self.send_json({"error": "Task title is required"}, 400)
                return

            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO tasks
                    (title, description, due_date, priority, completed)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        title,
                        str(data.get("description", "")).strip(),
                        data.get("due_date") or None,
                        data.get("priority", "Medium"),
                        0
                    )
                )
                task_id = cursor.lastrowid
                conn.commit()
                cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
                row = cursor.fetchone()
                result = self.row_to_dict(cursor, row)
            finally:
                conn.close()

            self.send_json(result, 201)

        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def do_PUT(self):
        task_id = self.get_task_id()
        if task_id is None:
            self.send_json({"error": "Invalid task ID"}, 400)
            return

        try:
            data = self.read_json()
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM tasks WHERE id = ?", (task_id,)
                )
                existing = cursor.fetchone()

                if existing is None:
                    self.send_json({"error": "Task not found"}, 404)
                    return

                old = self.row_to_dict(cursor, existing)

                title = str(data.get("title", old["title"])).strip()
                if not title:
                    self.send_json({"error": "Task title is required"}, 400)
                    return

                description = str(
                    data.get("description", old["description"] or "")
                ).strip()
                due_date = data.get("due_date", old["due_date"])
                priority = data.get("priority", old["priority"])
                completed = int(
                    bool(data.get("completed", old["completed"]))
                )

                if priority not in ("Low", "Medium", "High"):
                    self.send_json({"error": "Invalid priority"}, 400)
                    return

                cursor.execute(
                    """
                    UPDATE tasks
                    SET title = ?, description = ?, due_date = ?,
                        priority = ?, completed = ?
                    WHERE id = ?
                    """,
                    (
                        title, description, due_date or None,
                        priority, completed, task_id
                    )
                )
                conn.commit()
                cursor.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
                row = cursor.fetchone()
                result = self.row_to_dict(cursor, row)
            finally:
                conn.close()

            self.send_json(result)

        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def do_DELETE(self):
        task_id = self.get_task_id()
        if task_id is None:
            self.send_json({"error": "Invalid task ID"}, 400)
            return

        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            deleted = cursor.rowcount
            conn.commit()
        finally:
            conn.close()

        if deleted == 0:
            self.send_json({"error": "Task not found"}, 404)
        else:
            self.send_json({"message": "Task deleted successfully"})

    def serve_file(self, relative_path, content_type):
        file_path = BASE_DIR / relative_path
        try:
            content = file_path.read_bytes()
        except FileNotFoundError:
            self.send_json({"error": "File not found"}, 404)
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type + "; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    @staticmethod
    def row_to_dict(cursor, row):
        if hasattr(row, "keys"):
            return dict(row)
        columns = [column[0] for column in cursor.description]
        return dict(zip(columns, row))


if __name__ == "__main__":
    initialize_database()

    server = HTTPServer(("127.0.0.1", 8000), TaskManagerHandler)
    print("Task Manager server is running!")
    print("Open http://127.0.0.1:8000 in your browser.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()

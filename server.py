from http.server import HTTPServer, BaseHTTPRequestHandler


class EmptyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = HTTPServer(("", 8888), EmptyHandler)
    print("Server running on port 8888")
    server.serve_forever()
